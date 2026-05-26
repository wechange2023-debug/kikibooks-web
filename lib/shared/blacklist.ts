/**
 * 차단 상수 단일 진실 공급원 (single source of truth).
 *
 * Book Dash 404 책 차단에 쓰는 `BOOK_DASH_404_SOURCE_IDS`를 모든 표면이
 * 이 파일에서 import한다. phase-09b~11 동안 `lib/landing/popular-books.ts`에
 * 정의·export돼 4표면이 재사용했으나, 책 뷰어(`/book/[id]/read`)가 5번째
 * 표면으로 합류하며 옵션 B 임계("사용처 3개 이상")가 재확인되어 phase-12 CP2에서
 * 공용 모듈로 추출했다(ADR-0014 Amendment #5, F10 옵션 B 선이동).
 *
 * 5표면 인벤토리 (ADR-0014 Amendment #5):
 *   1. lib/landing/popular-books.ts — .neq('source_id', ...)        (랜딩 인기 책)
 *   2. lib/home/recommendations.ts  — .neq('source_id', ...)        (오늘의 추천)
 *   3. lib/home/categories.ts       — .neq('source_id', ...)        (카테고리 결과)
 *   4. app/book/[id]/page.tsx       — .includes() + notFound()      (책 상세)
 *   5. app/book/[id]/read/page.tsx  — .includes() + notFound()      (책 뷰어, CP3-a 신규)
 *
 * 단일 공급원 확립으로 ADR-0014 §6 후속 과제 2(슬러그 정상화 시 블랙리스트 축소)는
 * 본 파일 1곳 갱신으로 5표면에 전파된다.
 */

/**
 * Book Dash 표지 404 사전 차단 목록 (ADR-0014 결정 2 + Amendment #2·#3·#5).
 *
 * 다음 슬러그의 cover.jpg가 GitHub Pages에서 404를 반환한다(2026-05-20 측정,
 * Book Dash 영어 54권 중 4건, 87% 정상률). meta.yml에 identifier UUID가
 * 명시되어 있어 DB의 source_id는 UUID로 저장된다(sync_book_dash.py:152).
 *
 * 슬러그 복귀 시 자동 회복 여지를 위해 sync·DB 무변경, 조회 쿼리에서만 사전 차단.
 * ADR-0014 §6 후속 과제 2 — 정상화 확인 시 본 목록 축소 검토.
 *
 * 슬러그 ↔ UUID 매핑 (ADR-0014 Amendment #2 §B / Amendment #5 인용):
 *   the-lion-who-wouldnt-try → 9ca00316-fe46-11e5-86aa-5e5517507c66
 *   i-can-dress-myself       → 9c9eb452-fe46-11e5-86aa-5e5517507c66
 *   hugs-in-the-city         → 9c9eb574-fe46-11e5-86aa-5e5517507c66
 *   katiitis-song            → 9c9fffba-fe46-11e5-86aa-5e5517507c66
 */
export const BOOK_DASH_404_SOURCE_IDS = [
  '9ca00316-fe46-11e5-86aa-5e5517507c66', // the-lion-who-wouldnt-try
  '9c9eb452-fe46-11e5-86aa-5e5517507c66', // i-can-dress-myself
  '9c9eb574-fe46-11e5-86aa-5e5517507c66', // hugs-in-the-city
  '9c9fffba-fe46-11e5-86aa-5e5517507c66', // katiitis-song
] as const;
