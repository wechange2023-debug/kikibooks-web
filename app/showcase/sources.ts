/**
 * /showcase (임시 시연 메뉴) — 출처(source_platform) 라벨·화이트리스트 상수.
 *
 * 임시 시연용 격리 모듈이다. 시연 종료 후 `app/showcase` 디렉터리를 통째로 삭제하면
 * 전역 네비·기존 화면에 영향 없이 일괄 제거된다(작업지시서 §4 격리 요건).
 *
 * lib/book/copy.ts `sourcePlatformNames`는 book_dash·gdl 2개만 커버하고 AttributionBox
 * copy 객체에 종속이라, /showcase 표기용 전 enum 라벨을 별도 상수로 분리한다(§1).
 *
 * 라벨 키 = books.source_platform DB 값 (supabase/migrations/005 화이트리스트와 정합).
 * ※ 작업지시서 예시의 'asb'가 아니라 실제 값은 'african_storybook'.
 */

/** source_platform DB 값 → 화면 표기 라벨. migration 005 enum 전체. */
export const SOURCE_LABELS: Record<string, string> = {
  book_dash: 'Book Dash',
  gdl: 'Global Digital Library',
  african_storybook: 'African Storybook',
  bloom: 'Bloom Library',
  librivox: 'LibriVox',
  pg: 'Project Gutenberg',
  jybooks: 'JY Books',
  wjjr: '웅진주니어',
  magic_light: 'Magic Light Pictures',
};

/** [source] 라우트 화이트리스트 — 라벨맵 키만 허용(그 외 not-found). */
export function isKnownSource(source: string): boolean {
  return Object.prototype.hasOwnProperty.call(SOURCE_LABELS, source);
}

/** 출처 라벨(미정의 시 원값 폴백). */
export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

/**
 * 클라이언트 점진 렌더(무한 스크롤) 배치 크기.
 *
 * 채택: 후보 B(클라이언트 점진 렌더). 서버(page.tsx)가 해당 출처 전량(is_active=true)을
 * range 청크로 조회해 넘기고, ShowcaseGrid가 IntersectionObserver로 이 크기만큼씩 끊어
 * 렌더한다(끝까지 스크롤 시 전량 표시). /library의 cursor 무한스크롤(server action)은
 * source_platform 필터 미지원 + copy/필터 강결합이라, 필터 0인 showcase에는 server action
 * 없이 전량 조회 + 클라 slice가 더 단순하다(ASb 2,160행 전량 조회 ~0.3s 실측, 부담 없음).
 */
export const SHOWCASE_BATCH = 100;
