'use server';

import { assertAdmin } from '@/lib/admin/gate';
import {
  AdminChildFiltersSchema,
  AdminProfileFiltersSchema,
  getAdminChildren,
  getAdminProfiles,
  type AdminChildrenPage,
  type AdminProfilesPage,
} from '@/lib/admin/users/query';

/**
 * /admin/users 사용자·자녀 조회 server action — phase-13b CP4-b 신규.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용 (CP1-adr ADR-0019)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - D5 옵션 B: SELECT는 createServiceRoleClient (query.ts 내부) + 호출자(server action)
 *     가드 통과 후만. 본 모듈은 ②+③ assertAdmin 통과 후 query.ts SELECT wrapper 호출.
 *   - D7: 자녀 read-only — 본 모듈은 SELECT wrapper만. mutation server action 0건
 *     (toggle·update·delete·insert·upsert 0건).
 *   - D20: tabs URL 동기화 0건 — 본 action은 filters·cursor만 받고 tab은 클라이언트
 *     useState. tab 인자 0건(query 함수 분리 직역 정합).
 *   - D21: parent_email 마스킹 0건 — query.ts에서 JOIN 평탄화 처리. 본 모듈은 직접 노출.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 자진 신고 8번 박제 약화 (phase-13c follow-up 후보)
 * ──────────────────────────────────────────────────────────────────────────────
 *   spec scope_in line 97에는 CP4-a 박제로 query.ts만 명시되고 actions.ts는 박제 0건.
 *   본 모듈은 CP4-b 범위 확장으로 신규 박제 (Client 검색·페이지네이션 동적 호출 필수).
 *   CP3-a books는 query+actions 둘 다 CP3-a sub-step에 통합했으나 CP4는 분리:
 *     - CP4-a query.ts(read-only SELECT, server function)
 *     - CP4-b actions.ts(Client wrapper SELECT, server action)
 *   사유: CP4-a는 mutation 0건이라 actions 박제 0건이었고, Client wrapper SELECT는
 *   CP4-b page+browser와 같은 sub-step에 박제 정합 (browser가 import).
 *   phase-13c follow-up: spec sub_step_structure 박제 정정 (CP4-b actions 박제 명시).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 가드 3단 (mutation 0건이라 D2 ④단 service role UPDATE 제외)
 * ──────────────────────────────────────────────────────────────────────────────
 *   ① zod safeParse — filtersInput 외부 신뢰 0 (Client에서 unknown 직접 전달)
 *   ②+③ assertAdmin — auth + role IN ('admin','curator'). 미통과 시 ok/error 반환
 *   getAdminProfiles/Children try-catch — query.ts 내부 createServiceRoleClient SELECT
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 자진 신고 3번 박제 정합 — 에러 메시지 한국어 하드코딩
 * ──────────────────────────────────────────────────────────────────────────────
 *   AdminCopy.errors는 Record<string, never> 박제(CP2-a)라 메시지 박제 0건. 본 모듈
 *   하드코딩 메시지는 임시(updateChildLevel·fetchLibraryPage·fetchAdminBooksPage 동형).
 *   phase-13c follow-up 시 copy.errors로 이동.
 *
 * 의도 문서: docs/intent/admin-system.md §4.3·§5.5·§5.7
 * ADR: docs/adr/0019-admin-system.md D5·D7·D20·D21
 * 패턴 정합: lib/admin/books/actions.ts(CP3-a) fetchAdminBooksPage 100% 정합
 */

// =============================================================================
// Result types — books FetchAdminBooksPageResult 정합
// =============================================================================

export type FetchAdminProfilesPageResult =
  | { ok: true; page: AdminProfilesPage }
  | { ok: false; error: string };

export type FetchAdminChildrenPageResult =
  | { ok: true; page: AdminChildrenPage }
  | { ok: false; error: string };

// =============================================================================
// fetchAdminProfilesPage — profiles 페이지 fetch (Client 검색·페이지네이션)
// =============================================================================

/**
 * /admin/users profiles 탭의 1페이지를 가져온다 — AdminUsersBrowser가 검색 변경·
 * 무한 스크롤마다 호출.
 *
 * @param filtersInput unknown — AdminProfileFiltersSchema로 검증
 * @param cursor 다음 페이지 opaque cursor (null이면 첫 페이지)
 */
export async function fetchAdminProfilesPage(
  filtersInput: unknown,
  cursor: string | null,
): Promise<FetchAdminProfilesPageResult> {
  // ① zod
  const parsed = AdminProfileFiltersSchema.safeParse(filtersInput);
  if (!parsed.success) {
    return { ok: false, error: '필터 입력이 올바르지 않습니다.' };
  }

  // ②+③ assertAdmin
  const adminCheck = await assertAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  // SELECT — query.ts 내부 createServiceRoleClient
  try {
    const page = await getAdminProfiles(parsed.data, cursor);
    return { ok: true, page };
  } catch {
    return {
      ok: false,
      error: '사용자를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }
}

// =============================================================================
// fetchAdminChildrenPage — children 페이지 fetch (Client 검색·페이지네이션)
// =============================================================================

/**
 * /admin/users children 탭의 1페이지를 가져온다 — AdminUsersBrowser가 검색 변경·
 * 무한 스크롤마다 호출.
 *
 * @param filtersInput unknown — AdminChildFiltersSchema로 검증
 * @param cursor 다음 페이지 opaque cursor (null이면 첫 페이지)
 *
 * children 키워드 검색 2단계 쿼리는 query.ts 내부에서 처리(parent_email JOIN ilike).
 * 본 server action은 인자 검증·가드만.
 */
export async function fetchAdminChildrenPage(
  filtersInput: unknown,
  cursor: string | null,
): Promise<FetchAdminChildrenPageResult> {
  // ① zod
  const parsed = AdminChildFiltersSchema.safeParse(filtersInput);
  if (!parsed.success) {
    return { ok: false, error: '필터 입력이 올바르지 않습니다.' };
  }

  // ②+③ assertAdmin
  const adminCheck = await assertAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  // SELECT — query.ts 내부 createServiceRoleClient + parent_email JOIN
  try {
    const page = await getAdminChildren(parsed.data, cursor);
    return { ok: true, page };
  } catch {
    return {
      ok: false,
      error: '자녀를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }
}
