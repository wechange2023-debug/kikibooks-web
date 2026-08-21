/**
 * 퀴즈 보기로 쓸 수 없는 삽화 URL (Q-2d · 2026-08-21 전수 실측).
 *
 * 배경: 퀴즈 보기에 **완전 공백 카드**가 떴다(팀장 프로덕션 육안).
 * 원인은 깨진 링크가 아니라 **콘텐츠 자체가 백지**인 이미지였다 —
 * HTTP 200에 정상 JPEG/PNG인데 픽셀이 단색이라 렌더는 성공하고 화면만 비었다.
 * 그래서 상태 코드만 보는 검사로는 절대 잡히지 않는다.
 *
 * 실측: 모집단 858권의 **고유 image_url 8,096개 전수** 다운로드 후 픽셀 통계
 *   (`scripts/quiz_pilot/scan_blank_images.py`, 362초).
 *     정상 8,050 · 백지 6 · 거의단색(flat) 11 · 깨짐 2
 *   - 백지 판정 = 그레이스케일 **표준편차 < 3.0**. 실측 6건은 0.0~0.272로 사실상 단색이었다.
 *   - flat 11건(sd 3.0~7.8)은 **제외하지 않는다.** 육안 확인 결과 접시 위 부스러기·
 *     소년과 닭·나무 숟가락 등 **성긴 그림**이지 백지가 아니었다.
 *   - 1차 스캔의 '깨짐' 29건 중 27건은 동시요청 24개에 의한 **일시 차단**이었다
 *     (직렬 재시도로 전부 회복). 진짜 404는 2건뿐이다.
 *
 * ★ 왜 목록인가(규칙이 아니라): 6건이 세 소스(asb·bloom·book_dash)에 흩어져 있고
 *   URL 형태에 공통 패턴이 없다. 파일명·경로로는 구분되지 않으므로 규칙을 세울 근거가 없다.
 *
 * ★ 왜 런타임 원격 검사가 아닌가: 매 요청마다 이미지를 HTTP로 확인하면 퀴즈 한 판에
 *   수십 번의 왕복이 붙는다. 8,096장 중 8건(0.1%)을 위해 전 요청을 느리게 만들 수 없다.
 *
 * 갱신: 신규 도서 적재 후 `scan_blank_images.py`를 다시 돌려 이 목록을 갱신한다.
 *   데이터 자체(book_text.image_url)를 고치는 것이 근본 해결이나 그것은 별건이다 —
 *   `scripts/quiz_pilot/out/_blank_image_fix_draft.sql`에 초안만 둔다(팀장 실행).
 */
export const UNUSABLE_IMAGE_URLS: ReadonlySet<string> = new Set([
  // blank sd=0.272 mean=1.06
  'https://africanstorybook.org/illustrations/pages/73820302.png',
  // blank sd=0.0 mean=0.0
  'https://s3.amazonaws.com/bloomharvest/wbvUwmv1v1%2f1776110097391%2fbloomdigital%2fTail%2c%20Skunk5.png',
  // blank sd=0.0 mean=255.0
  'https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-images/book_dash-and-also/14.jpg',
  // blank sd=0.234 mean=108.02
  'https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-images/book_dash-the-rainbow-cloud/13.jpg',
  // blank sd=0.0 mean=255.0
  'https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-images/book_dash-why-is-there-a-hole-in-the-wall/14.jpg',
  // blank sd=0.0 mean=255.0
  'https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-images/book_dash-zenandes-helping-hands/14.jpg',
  // http:404
  'https://africanstorybook.org/illustrations/pages/.png',
  // http:404
  'https://africanstorybook.org/illustrations/pages/2116.png',
]);
