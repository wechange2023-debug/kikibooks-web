/**
 * 검수 시범 코호트 12권 (ADR-0051 구현 3-b 신규).
 *
 * 시범 코호트 12권 — 2026-07-20 팀장 확정. 회전 18권·오염 6권 제외 후 알파벳순 상위 12.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 용도
 * ──────────────────────────────────────────────────────────────────────────────
 *   /admin/review 목록의 화면단 필터 기준값이다. 조회(query.ts)는 152권 전건을 그대로
 *   반환하고, 목록 컴포넌트가 이 상수로 걸러 보여준다 — 조회 시그니처 변경 0건.
 *   DB·Storage에는 이 코호트를 나타내는 컬럼·플래그가 없다(상수만이 출처).
 *
 * 키는 slug(= books.source_id, ADR-0047 D1 조인 근거)다.
 * 12개 slug 전부 scripts/pdf_harvest/population_152.txt에 실재함을 확인했다(오타 0건).
 *
 * 회전 18권은 lib/admin/review/rotation-pages.ts의 ROTATED_PAGES 키와 같은 집합이다.
 *
 * ADR: docs/adr/0051-admin-review-screen.md D1
 */
export const PILOT_COHORT: string[] = [
  'a-day-out',
  'a-trip-to-the-tap',
  'a-very-busy-day',
  'aaaaahhh-mmawe',
  'alexs-super-medicine',
  'amahle-wants-to-help',
  'ann-nem-oh-nee-finds-adventure',
  'auntie-bois-gift',
  'baby-babble',
  'baby-talk',
  'babys-first-family-photo',
  'banzis-busy-bees',
];

/** 조회 비용 O(1)용 집합. 목록 필터가 매 행마다 참조한다. */
const PILOT_COHORT_SET = new Set(PILOT_COHORT);

/** 해당 책이 시범 코호트에 속하는가. */
export function isPilotCohort(slug: string): boolean {
  return PILOT_COHORT_SET.has(slug);
}
