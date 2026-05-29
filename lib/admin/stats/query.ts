import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * /admin 홈 통합 통계 4종 COUNT 단일 출처 (phase-13b CP5-a 신규).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용 (CP1-adr ADR-0019)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - D9: 통계 = 단순 COUNT 4종(사용자·자녀·완독 세션·활성 책). 시계열·필터·차트 0건.
 *     PostgREST `select(..., { count: 'exact', head: true })` 패턴(데이터 0건 반환 +
 *     count 헤더만). 외부 차트 라이브러리(recharts·chart.js 등) 의존 0건. 시계열은 F33.
 *   - D13: /admin 홈 통합. 별도 app/admin/stats/page.tsx 미생성. 본 CP5-a는 query.ts만,
 *     CP5-b가 app/admin/page.tsx 통합 + components/admin/stats/stats-dashboard.tsx.
 *   - D17: role 검증·캐싱 0건 — role 출처는 gate.ts requireAdmin이 책임. 본 모듈은
 *     service role로 RLS 우회 + COUNT만 담당. React.cache·unstable_cache 0건
 *     (force-dynamic 페이지가 매 진입 fresh — intent §4.4).
 *   - spec scope_in line 100 박제 직역:
 *       "lib/admin/stats/query.ts (CP5-a 신규 — getAdminStats: 4종 단순 COUNT(profiles·
 *        children·reading_sessions WHERE is_completed=true·books WHERE is_active=true),
 *        옵션 B + admin 가드. PostgREST count: 'exact' head: true 패턴)"
 *   - spec v6 박제: 4종 숫자가 Supabase SQL Editor의 SELECT COUNT(*) FROM profiles /
 *     children / reading_sessions WHERE is_completed=true / books WHERE is_active=true
 *     결과와 일치해야 한다.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 호출자 책임 박제 (Hard Rule 6, D5 옵션 B)
 * ──────────────────────────────────────────────────────────────────────────────
 *   getAdminStats 호출 전 호출자는 admin 가드를 통과해야 한다:
 *     - page Server Component (CP5-b 예정): app/admin/page.tsx. app/admin/layout.tsx의
 *       requireAdmin이 보증(D16 1중). page는 자체 가드 재호출 0건.
 *   본 모듈 내부는 가드 0건 — 호출자가 가드 통과를 보장한다는 신뢰 경계 채택
 *   (books/query.ts·users/query.ts 정합). `import 'server-only'`로 클라이언트 번들
 *   포함 시 빌드 실패 강제.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * service role 사용 사유 (RLS §9.2·§9.3·§9.4 우회 필수)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - profiles RLS §9.2: SELECT USING(auth.uid()=id) — 본인 행만. 전체 COUNT 불가.
 *   - children RLS §9.3: SELECT USING(parent_id=auth.uid()) — 본인 자녀만. 전체 COUNT 불가.
 *   - reading_sessions RLS §9.4: 본인 자녀 세션만. 전 completed COUNT 불가.
 *   - books §9.1 USING(true)는 본인 세션도 COUNT 가능하나, 4종 일관성 위해 모두 service
 *     role 채택. 옵션 B 박제(D5·D9) 정합.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * count 패턴 차이 박제 (자진 신고 정책)
 * ──────────────────────────────────────────────────────────────────────────────
 *   books/query.ts·users/query.ts는 limit+1 / hasMore 페이지네이션 패턴이라 count를
 *   쓰지 않는다. `{ count: 'exact', head: true }`(행 본문 0건 + count 헤더만)는 본
 *   CP5-a가 코드베이스 최초 도입이다. count는 number | null 반환이라 `?? 0` 폴백 필요.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 자진 신고 #9 — is_completed 인덱스 0건 (베타 규모 무시 가능)
 * ──────────────────────────────────────────────────────────────────────────────
 *   reading_sessions 인덱스는 child_id·book_id·started_at만(001 line 132~134).
 *   is_completed 인덱스 0건 → completedSessionsCount COUNT는 seq scan. 베타 규모에서
 *   무시 가능하나, 데이터 누적 시 partial index(WHERE is_completed) 검토 = phase-13c
 *   follow-up 후보.
 *   자진 신고 #10 — completed_at vs is_completed 동기 여부(완독 시 둘 다 set 되는지)는
 *   phase-13 보상 로직 영역. 박제는 is_completed=true 직역 충실 채택(D9·spec·v6).
 *   동기 검증은 phase-13c follow-up 후보.
 *
 * 의도 문서: docs/intent/admin-system.md §4.4·§5.6
 * ADR: docs/adr/0019-admin-system.md D9·D13·D17
 * 패턴 정합: lib/admin/books/query.ts·lib/admin/users/query.ts (server-only + service role + 호출자 가드 신뢰)
 */

/**
 * /admin 홈 통계 4종 COUNT 결과.
 *
 * 키 4종은 lib/admin/copy.ts stats.cards 키(profilesCount·childrenCount·
 * completedSessionsCount·activeBooksCount)와 1:1 동명 — CP5-b 카드 매핑 시 키 정합
 * (3중 박제: spec·ADR·copy).
 */
export interface AdminStats {
  /** profiles 전체 COUNT (사용자 수). */
  profilesCount: number;
  /** children 전체 COUNT (자녀 수). */
  childrenCount: number;
  /** reading_sessions WHERE is_completed=true COUNT (완독 세션 수). */
  completedSessionsCount: number;
  /** books WHERE is_active=true COUNT (활성 책 수). */
  activeBooksCount: number;
}

/**
 * /admin 홈 통계 4종 COUNT를 반환한다. 호출자는 admin 가드 통과 후 호출.
 *
 * RLS 우회: createServiceRoleClient (§9.2·§9.3·§9.4 본인 행만 → 전체 COUNT 우회).
 * 4종 병렬: Promise.all (각 쿼리 독립·의존성 0건 — intent §4.4).
 * COUNT 패턴: select('id', { count: 'exact', head: true }) — 행 본문 0건 + count 헤더만.
 * 에러 처리: 1건 실패 시 전체 throw (어느 테이블 실패인지 명확한 메시지).
 */
export async function getAdminStats(): Promise<AdminStats> {
  const supabase = createServiceRoleClient();

  const [profilesResult, childrenResult, completedSessionsResult, activeBooksResult] =
    await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('children').select('id', { count: 'exact', head: true }),
      supabase
        .from('reading_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('is_completed', true),
      supabase
        .from('books')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
    ]);

  if (profilesResult.error) {
    throw new Error(
      `getAdminStats: profiles 조회 실패 — ${profilesResult.error.message}`,
    );
  }
  if (childrenResult.error) {
    throw new Error(
      `getAdminStats: children 조회 실패 — ${childrenResult.error.message}`,
    );
  }
  if (completedSessionsResult.error) {
    throw new Error(
      `getAdminStats: reading_sessions 조회 실패 — ${completedSessionsResult.error.message}`,
    );
  }
  if (activeBooksResult.error) {
    throw new Error(
      `getAdminStats: books 조회 실패 — ${activeBooksResult.error.message}`,
    );
  }

  return {
    profilesCount: profilesResult.count ?? 0,
    childrenCount: childrenResult.count ?? 0,
    completedSessionsCount: completedSessionsResult.count ?? 0,
    activeBooksCount: activeBooksResult.count ?? 0,
  };
}
