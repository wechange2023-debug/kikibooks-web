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
 * 출처별 그리드 1회 표시 상한(시연용). 초과 출처는 안내문 노출.
 *
 * ★추천 채택안: 출처 무관 단일 LIMIT 100 + 안내문. African Storybook(2,160권) 등 대량
 * 출처를 한 번에 렌더하면 무거우므로 일괄 100권으로 컷한다. /library의 cursor 무한스크롤
 * (LibraryBrowser + server action)은 source_platform 필터를 지원하지 않고 copy/필터에
 * 강결합이라, 격리·임시 시연 목적에는 순수 Server Component + 단일 LIMIT가 더 단순·안전하다.
 */
export const SHOWCASE_LIMIT = 100;
