/**
 * `next/headers` 스텁 — Next 런타임 밖(드라이런 스크립트)에서 lib 모듈을 불러오기 위한 것.
 *
 * lib/supabase/server.ts가 파일 상단에서 `next/headers`를 import하는데, 이 패키지는
 * Next 서버 런타임에서만 해소된다. 드라이런은 **자기 Supabase 클라이언트를 직접 만들어
 * 인자로 넘기므로** cookies()에 도달하는 경로가 없다 — 호출되면 즉시 실패시켜
 * "조용히 잘못된 값"이 흘러들지 않게 한다.
 */
export function cookies() {
  throw new Error('next/headers stub: 드라이런은 cookies()를 쓰지 않는다 — 호출 경로 오류');
}
export function headers() {
  throw new Error('next/headers stub: 드라이런은 headers()를 쓰지 않는다 — 호출 경로 오류');
}
export function draftMode() {
  throw new Error('next/headers stub: 미사용');
}
