import 'server-only';

import { z } from 'zod';

import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * /admin/users 사용자·자녀 조회 단일 출처 (phase-13b CP4-a 신규).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용 (CP1-adr ADR-0019)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - D5: admin SELECT = createServiceRoleClient + 호출자(page Server Component·server
 *     action) requireAdmin/assertAdmin 통과 후만 호출. 옵션 A(RLS 정책 추가) 기각 —
 *     마이그레이션 002 + RLS 복잡도. profiles RLS §9.2·children RLS §9.3 불변.
 *   - D7: 자녀 정보 admin read-only — 본 모듈은 SELECT 전용. UPDATE·INSERT·DELETE 0건.
 *     자녀 편집/삭제 server action 도입 시 개인정보 정책 합의 + audit log + ADR 선결
 *     (F30 이연).
 *   - D17: 본인 세션 캐싱 0건 — role 출처는 gate.ts의 requireAdmin/assertAdmin이 책임.
 *     본 모듈은 service role로 RLS 우회만 담당하고 role 검증은 호출자 가드에 위임.
 *   - D21: 자녀 목록 parent_email 노출 + 마스킹 0건 — children 행에 부모 email JOIN
 *     (PostgREST embed `parent:profiles!parent_id(email)`). audit log는 F34.
 *   - spec scope_in line 97 박제 직역:
 *       "lib/admin/users/query.ts (CP4-a 신규 — getAdminProfiles + getAdminChildren:
 *        옵션 B SELECT, admin 가드 통과 후만 호출. profiles SELECT(id·email·role·
 *        display_name·created_at)·children SELECT(id·name·age·current_level·points·
 *        parent_email join)·cursor 페이지네이션)"
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 호출자 책임 박제 (Hard Rule 6, D5 옵션 B)
 * ──────────────────────────────────────────────────────────────────────────────
 *   getAdminProfiles·getAdminChildren 호출 전 호출자는 admin 가드를 통과해야 한다:
 *     - page Server Component (CP4-b 예정): app/admin/layout.tsx의 requireAdmin이
 *       보증(D16 1중). app/admin/users/page.tsx는 자체 가드 재호출 0건.
 *     - server action: 본 CP4-a는 read-only이라 server action 0건이며 assertAdmin
 *       호출 0건. 미래 mutation server action(F30 자녀 편집 등) 도입 시에만 assertAdmin
 *       통과 후 호출. books/query.ts(CP3-a) 정합 패턴.
 *   본 모듈 내부는 가드 0건 — 호출자가 가드 통과를 보장한다는 신뢰 경계 채택.
 *   `import 'server-only'`로 클라이언트 번들 포함 시 빌드 실패 강제.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * service role 사용 사유 (RLS §9.2·§9.3 우회 필수)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - profiles RLS §9.2: SELECT USING(auth.uid()=id) — 본인 행만. admin 전 profiles
 *     SELECT는 본인 세션 createClient로 불가 → service role 필수.
 *   - children RLS §9.3: SELECT USING(parent_id=auth.uid()) — 본인 자녀만. admin 전
 *     children SELECT는 본인 세션 createClient로 불가 → service role 필수.
 *   - books §9.1 USING(true)와 달리 profiles·children은 RLS 좁혀져 있어 books/query.ts
 *     보다 service role 의존도가 높음. 옵션 B 박제(D5) 정합.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * escapeIlikePattern 재정의 박제 (자진 신고 정책)
 * ──────────────────────────────────────────────────────────────────────────────
 *   lib/admin/books/query.ts(CP3-a)에 동일 함수 정의 3줄. 본 파일에서 재정의로 3번째
 *   사용처 도달. phase-13c follow-up 후보: lib/shared/sql.ts 추출 검토 (phase-13b 종료
 *   직전 변경 표면 최소화 우선 — 자진 신고 누적 7건 정책 정합).
 *
 * 의도 문서: docs/intent/admin-system.md §4.3·§5.5·§5.7
 * ADR: docs/adr/0019-admin-system.md D5·D7·D17·D21
 * 패턴 정합: lib/admin/books/query.ts (escape·encode/decodeCursor·keyset·zod·service role)
 */

// =============================================================================
// 상수 — books 정합
// =============================================================================

/** /admin/users 한 페이지 행 수. books ADMIN_BOOKS_PAGE_SIZE 정합. */
export const ADMIN_USERS_PAGE_SIZE = 24;

/** /admin/users 키워드 검색 최대 입력 길이. books ADMIN_KEYWORD_MAX 정합. */
export const ADMIN_USERS_KEYWORD_MAX = 50;

/**
 * children 키워드 2단계 쿼리(Step 1)의 profiles 매칭 상한.
 * 일반 베타 운영 가정(부모 N명·운영자 1~2명)에서 동일 키워드로 100건 초과 매칭은 비현실적.
 * 상한 도달 시 일부 매칭 누락 위험 박제: phase-13c follow-up 후보(상한 동적화 또는 페이지네이션).
 */
const PROFILE_MATCH_LIMIT = 100;

// =============================================================================
// escapeIlikePattern (3줄, books/query.ts 정합 재정의 — 자진 신고 메모는 JSDoc 박제)
// =============================================================================

/**
 * Postgres ILIKE 와일드카드 escape — 사용자 입력의 `%`·`_`·`\`를 리터럴로 처리.
 * lib/admin/books/query.ts·lib/library/query.ts 동일 구현 재정의 (자진 신고 메모: 3번째
 * 사용처. lib/shared/sql.ts 추출은 phase-13c follow-up 후보).
 */
function escapeIlikePattern(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}

// =============================================================================
// keyset cursor — books/query.ts KeysetCursor 정합 (sa 키 재사용)
// =============================================================================

/**
 * keyset cursor — (created_at, id)로 마지막 행 위치 표시.
 *
 * sa 키는 lib/admin/books/query.ts와 동일하게 재사용한다. cursor opaque(base64url)이라
 * 외부(CP4-b 클라이언트) 영향 0건이며, books의 sa = synced_at vs users의 sa = created_at
 * 의미 차이는 박제 주석으로만 명시한다(타입 시스템 분리 비용 회피).
 */
interface KeysetCursor {
  mode: 'keyset';
  /**
   * 이전 페이지 마지막 행의 timestamp (ISO 8601).
   *
   *   - profiles·children 둘 다 created_at 컬럼이 정렬 기준이다.
   *   - books의 synced_at과 의미가 다르나 키명은 sa로 통일(books/query.ts 정합).
   *   - cursor opaque이라 외부 영향 0건.
   */
  sa: string;
  /** 이전 페이지 마지막 행의 id (UUID). created_at tie-break용. */
  id: string;
}

function encodeCursor(value: KeysetCursor): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): KeysetCursor | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const obj = parsed as Record<string, unknown>;
    if (
      obj.mode === 'keyset' &&
      typeof obj.sa === 'string' &&
      typeof obj.id === 'string'
    ) {
      return { mode: 'keyset', sa: obj.sa, id: obj.id };
    }
    return null;
  } catch {
    return null;
  }
}

// =============================================================================
// zod 스키마 (호출자 신뢰 + 내부 안전 검증)
// =============================================================================

/**
 * profiles 검색 필터.
 *
 * 키워드만(level filter 박제 0건). copy.users.profilesSearch.placeholder
 * "이메일·이름으로 검색…" 박제(CP2-a) 직역 — email + display_name 양쪽 ilike OR.
 */
export const AdminProfileFiltersSchema = z.object({
  keyword: z.string().trim().max(ADMIN_USERS_KEYWORD_MAX).optional(),
});

/**
 * children 검색 필터.
 *
 * 키워드만. copy.users.childrenSearch.placeholder "자녀 이름·부모 이메일로 검색…" 박제
 * 직역 — children.name + JOIN profiles.email 양쪽 ilike (D21).
 */
export const AdminChildFiltersSchema = z.object({
  keyword: z.string().trim().max(ADMIN_USERS_KEYWORD_MAX).optional(),
});

export type AdminProfileFilters = z.infer<typeof AdminProfileFiltersSchema>;
export type AdminChildFilters = z.infer<typeof AdminChildFiltersSchema>;

// =============================================================================
// Row·Page types — profiles·children 컬럼 박제 직역
// =============================================================================

/**
 * profiles.role narrowing 타입 — CHECK 제약(001 line 25-26) 직역.
 *
 * gate.ts의 AdminRole('admin'|'curator')과 의미 분리 — 본 타입은 가드 통과 후 role이
 * 아닌 **CHECK 제약의 모든 role 값**을 박제한다. admin 화면의 role badge 표시는 'parent'
 * 행도 노출되므로(D21 정합) 'parent' 포함 narrowing이 필요하다.
 */
export type AdminProfileRole = 'parent' | 'admin' | 'curator';

/**
 * profiles 행 1건 — spec scope_in line 97 박제 5 컬럼 직역.
 *
 * email은 UNIQUE NOT NULL, display_name은 nullable, role은 CHECK 직역 narrowing.
 */
export interface AdminProfileRow {
  id: string;
  email: string;
  display_name: string | null;
  role: AdminProfileRole;
  created_at: string;
}

/** profiles 페이지 응답. books AdminBooksPage 정합 시그니처(rows·nextCursor·hasMore). */
export interface AdminProfilesPage {
  rows: AdminProfileRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * children 행 raw — PostgREST embed JOIN 응답 원본.
 *
 * `parent:profiles!parent_id(email)` 응답은 1:1 임베드이므로 parent는 단일 객체.
 * parent_id NOT NULL + ON DELETE CASCADE라 항상 매칭 보장이지만 타입 안전을 위해
 * nullable 허용 + flattenChildRow에서 fallback 처리.
 */
interface AdminChildRowRaw {
  id: string;
  name: string;
  age: number | null;
  current_level: number;
  points: number;
  created_at: string;
  parent: { email: string } | null;
}

/**
 * children 행 1건 — spec scope_in line 97 박제 7 컬럼 직역.
 *
 * parent_email은 PostgREST embed JOIN 평탄화 결과(D21 마스킹 0건).
 */
export interface AdminChildRow {
  id: string;
  name: string;
  age: number | null;
  current_level: number;
  points: number;
  created_at: string;
  parent_email: string;
}

/** children 페이지 응답. AdminProfilesPage 정합 시그니처. */
export interface AdminChildrenPage {
  rows: AdminChildRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * raw → flat 변환 — parent embed를 parent_email 평탄화.
 *
 * raw.parent가 null인 경우(parent_id 무결성 위반 시 등 비정상)는 빈 문자열 fallback.
 * 정상 운영에서는 항상 정상 매칭(parent_id NOT NULL + FK ON DELETE CASCADE).
 */
function flattenChildRow(raw: AdminChildRowRaw): AdminChildRow {
  return {
    id: raw.id,
    name: raw.name,
    age: raw.age,
    current_level: raw.current_level,
    points: raw.points,
    created_at: raw.created_at,
    parent_email: raw.parent?.email ?? '',
  };
}

// =============================================================================
// getAdminProfiles — profiles 1페이지 조회
// =============================================================================

/**
 * profiles 1페이지를 반환한다. 호출자는 admin 가드 통과 후 호출.
 *
 * @param filters AdminProfileFilters — 호출자가 zod 통과를 보장하거나 본 함수가 내부에서
 *                재검증한다(내부 안전 검증). 빈 객체 `{}`는 전체 조회(첫 진입).
 * @param cursor 다음 페이지 opaque cursor. null이면 첫 페이지.
 *
 * RLS 우회: createServiceRoleClient (RLS §9.2 본인 행만 → 전 사용자 SELECT 우회).
 * ORDER: created_at DESC, id ASC. LIMIT = ADMIN_USERS_PAGE_SIZE + 1 (hasMore 판정).
 * 키워드 검색: copy.users.profilesSearch.placeholder 박제 직역 — email + display_name ilike OR.
 */
export async function getAdminProfiles(
  filters: AdminProfileFilters,
  cursor: string | null = null,
): Promise<AdminProfilesPage> {
  // 내부 안전 검증 (호출자 신뢰지만 추가 막)
  const parsed = AdminProfileFiltersSchema.safeParse(filters);
  if (!parsed.success) {
    throw new Error('getAdminProfiles: 필터 입력 검증 실패');
  }
  const validFilters = parsed.data;

  const supabase = createServiceRoleClient();

  let query = supabase
    .from('profiles')
    .select('id, email, display_name, role, created_at');

  // 키워드: email + display_name ilike OR (박제 직역)
  if (validFilters.keyword && validFilters.keyword.length > 0) {
    const pattern = escapeIlikePattern(validFilters.keyword);
    query = query.or(`email.ilike.%${pattern}%,display_name.ilike.%${pattern}%`);
  }

  // keyset cursor
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded?.mode === 'keyset') {
      query = query.or(
        `created_at.lt.${decoded.sa},and(created_at.eq.${decoded.sa},id.gt.${decoded.id})`,
      );
    }
    // 손상 cursor는 silent 폴백 = 첫 페이지(books/query.ts 정합).
  }

  query = query
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(ADMIN_USERS_PAGE_SIZE + 1);

  const { data, error } = await query.returns<AdminProfileRow[]>();
  if (error) {
    throw new Error(`getAdminProfiles: profiles 조회 실패 — ${error.message}`);
  }

  const rows = data ?? [];
  const hasMore = rows.length > ADMIN_USERS_PAGE_SIZE;
  const page = rows.slice(0, ADMIN_USERS_PAGE_SIZE);
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ mode: 'keyset', sa: last.created_at, id: last.id })
      : null;

  return { rows: page, nextCursor, hasMore };
}

// =============================================================================
// getAdminChildren — children 1페이지 조회 (parent_email JOIN + 2단계 키워드)
// =============================================================================

/**
 * children 1페이지를 반환한다. 호출자는 admin 가드 통과 후 호출.
 *
 * @param filters AdminChildFilters — 호출자가 zod 통과 보장 또는 내부 재검증.
 * @param cursor 다음 페이지 opaque cursor.
 *
 * RLS 우회: createServiceRoleClient (RLS §9.3 본인 자녀만 → 전 자녀 SELECT 우회).
 * ORDER: created_at DESC, id ASC.
 *
 * JOIN: PostgREST embed `parent:profiles!parent_id(email)` → flattenChildRow로 평탄화.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 키워드 검색 2단계 쿼리 패턴 (intent §4.3 박제 + PostgREST 한계 회피)
 * ──────────────────────────────────────────────────────────────────────────────
 *   박제: copy.users.childrenSearch.placeholder "자녀 이름·부모 이메일로 검색…" 직역.
 *   PostgREST .or() 내부에서 embedded resource ilike + 본 테이블 ilike의 OR 결합은
 *   안정적 지원 미명확. RPC 함수 정의는 마이그레이션 002 = Hard Rule 8 위반. 따라서
 *   2단계 쿼리로 동등 동작 구현:
 *
 *   Step 1: profiles where email ilike → matching_parent_ids 수집 (상한 PROFILE_MATCH_LIMIT).
 *   Step 2: children where (name ilike OR parent_id IN matching_parent_ids).
 *
 *   ids 빈 시 fallback: name ilike 단일 조건만 적용.
 */
export async function getAdminChildren(
  filters: AdminChildFilters,
  cursor: string | null = null,
): Promise<AdminChildrenPage> {
  // 내부 안전 검증
  const parsed = AdminChildFiltersSchema.safeParse(filters);
  if (!parsed.success) {
    throw new Error('getAdminChildren: 필터 입력 검증 실패');
  }
  const validFilters = parsed.data;

  const supabase = createServiceRoleClient();

  const trimmedKeyword = validFilters.keyword?.trim() ?? '';
  const hasKeyword = trimmedKeyword.length > 0;
  const pattern = hasKeyword ? escapeIlikePattern(trimmedKeyword) : '';

  // Step 1: keyword 있으면 parent profiles 매칭 ids 수집
  let matchingParentIds: string[] = [];
  if (hasKeyword) {
    const { data: profileMatches, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', `%${pattern}%`)
      .limit(PROFILE_MATCH_LIMIT)
      .returns<Array<{ id: string }>>();

    if (profileError) {
      throw new Error(
        `getAdminChildren: profiles 매칭 조회 실패 — ${profileError.message}`,
      );
    }

    matchingParentIds = (profileMatches ?? []).map((row) => row.id);
  }

  // Step 2: children 쿼리 + parent embed
  let query = supabase
    .from('children')
    .select(
      'id, name, age, current_level, points, created_at, parent:profiles!parent_id(email)',
    );

  // 키워드 분기 (name ilike + parent_id IN ids 결합)
  if (hasKeyword) {
    if (matchingParentIds.length > 0) {
      const idsCsv = matchingParentIds.join(',');
      query = query.or(`name.ilike.%${pattern}%,parent_id.in.(${idsCsv})`);
    } else {
      // ids 빈 fallback: name ilike만
      query = query.ilike('name', `%${pattern}%`);
    }
  }

  // keyset cursor
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded?.mode === 'keyset') {
      query = query.or(
        `created_at.lt.${decoded.sa},and(created_at.eq.${decoded.sa},id.gt.${decoded.id})`,
      );
    }
    // 손상 cursor는 silent 폴백.
  }

  query = query
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(ADMIN_USERS_PAGE_SIZE + 1);

  const { data, error } = await query.returns<AdminChildRowRaw[]>();
  if (error) {
    throw new Error(`getAdminChildren: children 조회 실패 — ${error.message}`);
  }

  const rawRows = data ?? [];
  const hasMore = rawRows.length > ADMIN_USERS_PAGE_SIZE;
  const pageRaw = rawRows.slice(0, ADMIN_USERS_PAGE_SIZE);
  const rows = pageRaw.map(flattenChildRow);
  const last = pageRaw[pageRaw.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ mode: 'keyset', sa: last.created_at, id: last.id })
      : null;

  return { rows, nextCursor, hasMore };
}
