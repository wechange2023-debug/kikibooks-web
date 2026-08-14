/**
 * 관리자 미리보기 진입 판별 — 세션 증식 트랙 재발 방지(안1 + 안2 병용).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 왜 필요한가 (ADR-0059 §Non-goals '원인 확정')
 * ──────────────────────────────────────────────────────────────────────────────
 *   관리자 도서 목록의 썸네일이 **사용자용 리더 라우트를 그대로** 연다
 *   (components/admin/books/admin-books-browser.tsx — 커밋 5bd84c8, 2026-07-28).
 *   리더는 마운트 시 startReadingSession을 부르므로, 검수 목적의 열람 1회마다
 *   미완독 세션이 1행씩 쌓였다. 2026-08-15 실측 2,381행이 그 흔적이다.
 *
 *   화면을 분리하지 않는다 — "admin 전용 뷰어 0건, 운영자와 사용자가 같은 화면을
 *   본다(검수 신뢰성)"는 기존 원칙을 그대로 지킨다. **화면은 같고 기록만 남기지
 *   않는다**. 그 구분을 URL 파라미터 하나(`?preview=1`)로 표현한다.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 2중 방어 — 클라이언트가 1차, 서버가 2차
 * ──────────────────────────────────────────────────────────────────────────────
 *   ① 리더 3종(html·audio·asb)이 마운트 시 usePreviewEntry()로 판별해 호출 자체를
 *      건너뛴다(components/book/use-preview-entry.ts).
 *   ② startReadingSession이 Referer의 `preview` + **관리자 role**을 AND로 확인해
 *      한 번 더 막는다(lib/book/reading-session.ts). ①을 빠뜨린 경로가 생겨도
 *      관리자 열람은 기록되지 않는다.
 *
 *   ②가 **관리자 AND preview**인 이유: role만으로 막으면 관리자가 자기 자녀 계정으로
 *   실제 독서를 할 때 그 기록까지 사라진다(팀장이 관리자이자 실사용자다). 두 조건을
 *   모두 요구하면 그 위험이 없다.
 *
 * 본 모듈은 **순수 함수만** 둔다 — React·next/navigation 의존 0건이라 server action과
 * client component 양쪽에서 그대로 쓴다. 훅은 client 경계 때문에 별도 파일이다.
 */

/** 미리보기 진입 표시 쿼리 키. */
export const PREVIEW_PARAM = 'preview';

/** 미리보기 진입으로 인정하는 값. 이 값과 정확히 일치할 때만 참이다. */
export const PREVIEW_VALUE = '1';

/**
 * 쿼리 파라미터 값이 미리보기 진입인지 판정한다.
 *
 * 값이 없거나 다른 값이면 false — 판정은 **화이트리스트**다(오탈자·빈 값은 정상 열람
 * 으로 취급). 기록이 남는 쪽이 안전한 실패 방향이기 때문이다.
 */
export function isPreviewParamValue(value: string | null | undefined): boolean {
  return value === PREVIEW_VALUE;
}

/**
 * URL 문자열(예: server action의 Referer 헤더)이 미리보기 진입인지 판정한다.
 *
 * 파싱 실패·헤더 부재는 false — 판정 불가 시 **정상 열람으로 취급해 기록을 남긴다**
 * (fail-open toward recording). 실사용자의 독서 기록을 조용히 잃는 것보다,
 * 관리자 열람이 한 건 기록되는 편이 복구 가능한 실패다.
 */
export function isPreviewUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    return isPreviewParamValue(new URL(url).searchParams.get(PREVIEW_PARAM));
  } catch {
    return false;
  }
}

/** 관리자 화면이 리더를 열 때 쓰는 href — 사용자용 라우트 + 미리보기 표시. */
export function previewReadHref(bookId: string): string {
  return `/book/${bookId}/read?${PREVIEW_PARAM}=${PREVIEW_VALUE}`;
}
