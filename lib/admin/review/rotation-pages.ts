/**
 * 회전 의심 페이지 상수 (ADR-0051 D4 / ADR-0050 D3 구현 3 신규).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 출처와 좌표계
 * ──────────────────────────────────────────────────────────────────────────────
 *   원본: scratchpad/rotation_audit_154.csv (scripts/pdf_harvest/audit_rotation.py 산출)
 *   - 원본 CSV는 page_no **1-based**, 본 상수는 **0-based**(book_text.page_index 기준,
 *     ADR-0046 D2). 변환식 page_index = page_no - 1 을 적용해 고정했다.
 *   - scratchpad는 배포 산출물이 아니므로 앱이 CSV를 직접 읽지 않는다. 화면이 참조할 수
 *     있도록 본 파일로 값을 고정(freeze)한다. CSV가 갱신되면 본 파일을 다시 생성해야 한다.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 33면 / 18권의 정의 (81면 전체가 아님)
 * ──────────────────────────────────────────────────────────────────────────────
 *   CSV의 is_rotated=1 은 **81면**이다. 그중 본 상수가 담는 것은 **직교회전 33면 / 18권**뿐이다.
 *     - 직교회전(포함): span_dirs에 (0,1)·(0,-1)·(-1,0) 중 하나라도 있는 면.
 *       페이지 텍스트가 90° 회전 인쇄돼 읽기순서가 역전될 수 있는 면이다(ADR-0050 Context).
 *     - 대각선만(제외): (1,±1)만 있는 48면 / 24권. 아크형 SFX·장식 텍스트로 원본 디자인이며
 *       페이지 방향은 정상이다 — 교정·표시 대상이 아니다(ADR-0050 D4 박제 직역).
 *   실측 검산: 총 2,156행 / is_rotated=1 81면 / 직교 33면·18권 / 대각선만 48면·24권.
 *   ADR-0050 Context의 "직교회전 33면 / 18권 + 대각선만 48면"과 정확히 일치.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 용도 제한
 * ──────────────────────────────────────────────────────────────────────────────
 *   검수 화면의 "⚠ 회전 의심" **표시 전용**이다. 이미지 자동교정·텍스트 자동교정은 하지
 *   않는다(ADR-0050 D1·D2 유지 — 검수자는 원본과 동일한 화면을 봐야 한다).
 *
 * 키는 slug(= books.source_id, ADR-0047 D1 조인 근거)다.
 *
 * ADR: docs/adr/0051-admin-review-screen.md D4, docs/adr/0050-rotated-page-handling.md D1·D2·D3·D4
 */

/** slug → 회전 의심 page_index 목록(0-based, 오름차순). 직교회전 33면 / 18권. */
export const ROTATED_PAGES: Record<string, number[]> = {
  'catch-that-cat': [4],
  'how-do-you-eat': [11],
  'how-do-you-sleep': [2, 4, 6, 7, 9],
  'khaya-wants-to-row': [2, 5, 11],
  'monkey-business': [5, 6, 7, 8, 10],
  'my-dream-in-the-drawer': [12],
  'pako-the-pigeon-disappears': [6],
  samoosas: [11],
  shhhhh: [0, 1, 11],
  'tejus-shadow': [9],
  'the-best-gift': [11],
  'the-box': [10],
  'the-monster-must-go': [7, 9],
  'theres-a-fire-on-the-mountain': [9],
  'theres-an-alien-in-my-house': [4],
  'thulis-tissue': [9],
  'whats-happened-to-our-water': [4, 6, 10],
  'you-yes-you': [4],
};

/** 해당 책에 회전 의심 면이 하나라도 있는가(목록 화면 ⚠ 아이콘용). */
export function hasRotatedPages(slug: string): boolean {
  return (ROTATED_PAGES[slug]?.length ?? 0) > 0;
}

/** 해당 면이 회전 의심인가(상세 화면 배지용). page_index는 0-based. */
export function isRotatedPage(slug: string, pageIndex: number): boolean {
  return ROTATED_PAGES[slug]?.includes(pageIndex) ?? false;
}
