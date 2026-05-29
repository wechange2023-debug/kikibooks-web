import 'server-only';

import { z } from 'zod';

import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * /admin/books 큐레이션 화면 책 카탈로그 조회 단일 출처 (phase-13b CP3-a 신규).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용 (CP1-adr ADR-0019)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - D5: admin SELECT = createServiceRoleClient + 호출자(page Server Component·server
 *     action) requireAdmin/assertAdmin 통과 후만 호출. 옵션 A(RLS 정책 추가) 기각.
 *   - D2 ④단: secret 키 사용은 admin 가드 통과 후만. 본 모듈은 SELECT 전용 — UPDATE/
 *     INSERT/DELETE 0건(actions.ts가 mutation 책임).
 *   - spec scope_in line 93: SELECT 컬럼 = id·title·source_platform·license·is_active·
 *     level·age_min·age_max·synced_at·cover_url·attribution_text 박제 직역.
 *   - intent §4.2: 디폴트 is_active = any(공개·비공개 둘 다). admin은 비공개 책도
 *     봐야 함(/library와 차이). 블랙리스트(BOOK_DASH_404_SOURCE_IDS) 적용 0건.
 *   - intent §5.4 + library/query.ts 정합: synced_at DESC + id ASC 복합 keyset cursor
 *     (opaque base64url). 카테고리 필터 0건(admin은 카테고리 그리드 무관).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 호출자 책임 박제 (Hard Rule 6)
 * ──────────────────────────────────────────────────────────────────────────────
 *   getAdminBooks 호출 전 호출자는 다음 중 하나로 admin 가드를 통과해야 한다:
 *     - page Server Component: app/admin/layout.tsx의 requireAdmin이 보증(D16 1중)
 *     - server action: assertAdmin()의 ok:true 반환 후 호출
 *   본 모듈 내부는 가드 0건이다 — 호출자가 가드 통과를 보장한다는 신뢰 경계 채택.
 *   `import 'server-only'`로 클라이언트 번들 포함 시 빌드 실패 강제.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * service role 사용 사유 (admin 패턴 일관성)
 * ──────────────────────────────────────────────────────────────────────────────
 *   books §9.1 SELECT USING(true)라 본인 세션 createClient도 비공개 책 포함 SELECT가
 *   가능하다. 그럼에도 service role 채택:
 *     - 박제 spec line 93 직역 "createServiceRoleClient + 호출자 가드 통과 후만 호출"
 *     - actions.ts(UPDATE)와 같은 클라이언트 패턴으로 일관성 확보
 *     - 향후 §9.1을 `USING(is_active OR auth.role()='service_role')` 같은 RLS로 좁힐 때
 *       admin SELECT가 자동 정합 유지
 *
 * 의도 문서: docs/intent/admin-system.md §4.2·§5.4·§5.7
 * ADR: docs/adr/0019-admin-system.md D2·D5
 * 패턴 정합: lib/library/query.ts(escape·encode/decodeCursor·keyset·zod 단일 export)
 */

/** /admin/books 한 페이지 책 수. lib/library/query.ts LIBRARY_PAGE_SIZE 정합. */
export const ADMIN_BOOKS_PAGE_SIZE = 24;

/** 키워드 검색 최대 입력 길이. lib/library/query.ts LIBRARY_KEYWORD_MAX 정합. */
export const ADMIN_KEYWORD_MAX = 50;

/**
 * /admin/books 필터 zod 스키마.
 *
 *   - isActive: 3택 enum (any | true | false). copy.books.filters.isActiveAnyLabel/
 *     TrueLabel/FalseLabel(CP2-a) 정합. URL param·form input은 문자열로 도착하므로
 *     boolean coerce 대신 enum 채택(서버 분기 명시).
 *   - level: 1~5 number 또는 'null' literal sentinel(NULL 필터). copy.books.filters.
 *     levelNullLabel "미분류" 정합. union 채택(단일 select UX 정합).
 *   - keyword: trim + ADMIN_KEYWORD_MAX. library/query 동일 패턴.
 *
 * 빈/미정의는 optional로 통과 → 필터 미적용 해석(any).
 */
export const AdminBookFiltersSchema = z.object({
  isActive: z.enum(['any', 'true', 'false']).optional(),
  level: z
    .union([
      z.coerce.number().int().min(1).max(5),
      z.literal('null'),
    ])
    .optional(),
  keyword: z.string().trim().max(ADMIN_KEYWORD_MAX).optional(),
});

export type AdminBookFilters = z.infer<typeof AdminBookFiltersSchema>;

/**
 * /admin/books 책 1행 — spec scope_in line 93 박제 11 컬럼.
 *
 * cover_url·attribution_text는 admin 화면 행 데이터(표지 thumb + 라이선스 캡션 디버그).
 * source_id는 미포함 — admin UI는 source_platform(badge)만으로 충분.
 */
export interface AdminBookRow {
  id: string;
  title: string;
  source_platform: string;
  license: string;
  is_active: boolean;
  level: number | null;
  age_min: number | null;
  age_max: number | null;
  synced_at: string;
  cover_url: string;
  attribution_text: string;
}

/**
 * /admin/books 한 페이지 응답.
 *
 * library/query.ts LibraryPage와 시그니처가 다르다 — count·nextCursor·hasMore 외에
 * rows 키 명칭이 books → rows(admin 페이지 카드 컴포넌트는 PopularBook 변환 없음).
 */
export interface AdminBooksPage {
  rows: AdminBookRow[];
  /** 다음 페이지 조회용 opaque cursor. 마지막 페이지면 null. */
  nextCursor: string | null;
  /** UI sentinel 표시용 — nextCursor !== null과 동일. */
  hasMore: boolean;
}

/** keyset cursor — synced_at + id로 마지막 책 위치 표시. library/query.ts 정합. */
interface KeysetCursor {
  mode: 'keyset';
  /** 이전 페이지 마지막 책의 synced_at (ISO 8601). */
  sa: string;
  /** 이전 페이지 마지막 책의 id (UUID). */
  id: string;
}

/**
 * Postgres ILIKE 와일드카드 escape — 사용자 입력의 `%`·`_`·`\`를 리터럴로 처리한다.
 *
 * lib/library/query.ts escapeIlikePattern과 동일 구현. 본 모듈은 admin 단일 사용처라
 * lib/shared/ 추출 없이 내부 재정의(변경 표면 최소, 외부 검토 5번 결과 정합).
 * 향후 3번째 사용처 추가 시 lib/shared/sql.ts로 추출 박제.
 */
function escapeIlikePattern(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}

/**
 * opaque cursor 인코딩 — JSON → base64url. CP3-b 클라이언트는 내용을 모른다.
 */
function encodeCursor(value: KeysetCursor): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/**
 * opaque cursor 디코딩 — 손상·구버전 cursor는 null 반환(silent 폴백 = 첫 페이지).
 */
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

/**
 * /admin/books 책 목록 1페이지를 반환한다.
 *
 * @param filters AdminBookFilters — 호출 전 호출자가 zod 통과를 보장하거나, 본 함수가
 *                받는 시점에서 이미 검증된 값이어야 한다. server action은 자체 zod 통과 후
 *                전달, page Server Component는 빈 객체 `{}`(첫 진입)를 전달.
 * @param cursor 다음 페이지 opaque cursor. null이면 첫 페이지.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 적용 필터 (누적)
 * ──────────────────────────────────────────────────────────────────────────────
 *   1) isActive
 *      - undefined·'any' → 조건 0건(공개·비공개 둘 다, admin 디폴트)
 *      - 'true' → .eq('is_active', true)
 *      - 'false' → .eq('is_active', false)
 *   2) level
 *      - undefined → 조건 0건
 *      - 1~5 → .eq('level', N)
 *      - 'null' → .is('level', null)  (미분류 책만, copy.levelNullLabel 정합)
 *   3) keyword (trim 후 length > 0) → .ilike('title', `%${escape(keyword)}%`)
 *   4) keyset cursor (cursor 디코딩 성공 시)
 *
 * ORDER: synced_at DESC, id ASC. LIMIT = ADMIN_BOOKS_PAGE_SIZE + 1(hasMore 판정).
 *
 * 카테고리 필터·블랙리스트 0건 — admin은 모든 책을 봐야 함.
 *
 * 호출자 책임: requireAdmin/assertAdmin 통과 후 호출. 본 함수는 가드 0건.
 */
export async function getAdminBooks(
  filters: AdminBookFilters,
  cursor: string | null = null,
): Promise<AdminBooksPage> {
  const supabase = createServiceRoleClient();

  let query = supabase
    .from('books')
    .select(
      'id, title, source_platform, license, is_active, level, age_min, age_max, synced_at, cover_url, attribution_text',
    );

  // 1) is_active 3택 분기
  if (filters.isActive === 'true') {
    query = query.eq('is_active', true);
  } else if (filters.isActive === 'false') {
    query = query.eq('is_active', false);
  }
  // 'any' 또는 undefined → 조건 0건 (admin 디폴트 — 비공개 책 포함)

  // 2) level 분기 (1~5 또는 NULL 필터)
  if (typeof filters.level === 'number') {
    query = query.eq('level', filters.level);
  } else if (filters.level === 'null') {
    query = query.is('level', null);
  }

  // 3) keyword title ilike
  if (filters.keyword && filters.keyword.length > 0) {
    query = query.ilike('title', `%${escapeIlikePattern(filters.keyword)}%`);
  }

  // 4) keyset cursor
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded?.mode === 'keyset') {
      // (synced_at, id) keyset:
      //   WHERE synced_at < $sa OR (synced_at = $sa AND id > $id)
      query = query.or(
        `synced_at.lt.${decoded.sa},and(synced_at.eq.${decoded.sa},id.gt.${decoded.id})`,
      );
    }
    // 잘못된 cursor(손상·구버전)는 silent 폴백 = 첫 페이지.
  }

  query = query
    .order('synced_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(ADMIN_BOOKS_PAGE_SIZE + 1);

  const { data, error } = await query.returns<AdminBookRow[]>();
  if (error) {
    throw new Error(`getAdminBooks: books 조회 실패 — ${error.message}`);
  }

  const rows = data ?? [];
  const hasMore = rows.length > ADMIN_BOOKS_PAGE_SIZE;
  const page = rows.slice(0, ADMIN_BOOKS_PAGE_SIZE);
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ mode: 'keyset', sa: last.synced_at, id: last.id })
      : null;

  return {
    rows: page,
    nextCursor,
    hasMore,
  };
}
