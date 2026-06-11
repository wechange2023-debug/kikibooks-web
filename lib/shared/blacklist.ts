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
 * Book Dash 원본 이미지 404 사전 차단 목록 (ADR-0014 결정 2 + Amendment #2·#3·#5·#6).
 *
 * 차단 사유 = 원본(bookdash.github.io)에서 이미지가 404 — **표지(cover.jpg) 또는 본문 이미지**.
 *   - 표지 404 4건(2026-05-20 측정): Amendment #2·#3·#5. 표지 깨짐.
 *   - 본문 이미지 404 11건(2026-06-11 전수 감사, Amendment #6): 54권 중 15권 불량(=기존 표지
 *     4건 + 신규 11건). 불량책은 본문 `images/NN.jpg`(상대경로)가 12~13장 전부 404 — 원본
 *     미배포. 페이지 자체는 200이라 뷰어에 깨진 이미지로 노출됨. 정상 39권은 루트절대경로 200.
 *
 * meta.yml에 identifier UUID가 명시되어 있어 DB의 source_id는 UUID로 저장된다(sync_book_dash.py:152).
 * 슬러그 복귀 시 자동 회복 여지를 위해 sync·DB 무변경, 조회 쿼리에서만 사전 차단.
 * 주간 cron(sync-book-dash.yml, 일 02:00)이 is_active=True로 되돌리므로 is_active=false 대신
 * 코드 측 블랙리스트로 차단한다(cron-proof). ADR-0014 §6 후속 과제 2 — 원본 복구 확인 시 축소.
 */
export const BOOK_DASH_404_SOURCE_IDS = [
  // 표지 cover.jpg 404 (2026-05-20, Amendment #2·#3·#5) — 본문 이미지도 404 확인(Am#6)
  '9ca00316-fe46-11e5-86aa-5e5517507c66', // the-lion-who-wouldnt-try
  '9c9eb452-fe46-11e5-86aa-5e5517507c66', // i-can-dress-myself
  '9c9eb574-fe46-11e5-86aa-5e5517507c66', // hugs-in-the-city
  '9c9fffba-fe46-11e5-86aa-5e5517507c66', // katiitis-song
  // 본문 이미지 404 신규 11건 (2026-06-11 전수 감사, Amendment #6)
  '9c9f4976-fe46-11e5-86aa-5e5517507c66', // hippo-wants-to-dance
  '9c9ffed4-fe46-11e5-86aa-5e5517507c66', // it-wasnt-me
  '9c9f4da4-fe46-11e5-86aa-5e5517507c66', // little-sock
  '9c9f41f6-fe46-11e5-86aa-5e5517507c66', // shongololos-shoes
  '9c9f450c-fe46-11e5-86aa-5e5517507c66', // springloaded
  '9c9ec05a-fe46-11e5-86aa-5e5517507c66', // the-elephant-in-the-room
  '9c9ebdc6-fe46-11e5-86aa-5e5517507c66', // what-is-it
  '9c9f471e-fe46-11e5-86aa-5e5517507c66', // when-i-grow-up
  '9c9f485e-fe46-11e5-86aa-5e5517507c66', // who-is-our-friend
  '9c9f5790-fe46-11e5-86aa-5e5517507c66', // the-best-thing-ever
  '9c9eb7e0-fe46-11e5-86aa-5e5517507c66', // mrs-penguins-palace
] as const;
