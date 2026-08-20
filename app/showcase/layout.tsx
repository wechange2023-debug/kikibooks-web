import { AppFooter } from '@/components/app/app-footer';

/**
 * /showcase 계열 레이아웃 — 공통 푸터 주입 (ADR-0061 **D6**).
 *
 * 신설 사유: `/showcase`·`/showcase/[source]` 두 라우트는 `(reader)` route group
 *   **밖**이라 공통 레이아웃을 공유하지 않았고, 그 결과 CC BY 안내가 0건이었다.
 *   두 화면 모두 표지를 렌더하므로(`app/showcase/[source]/page.tsx`가 cover_url을
 *   SELECT하고 `showcase-book-card.tsx`가 렌더) **ADR-0013 결정 2의 어트리뷰션
 *   하한선이 적용되는 표면**이다.
 *
 * 각 page가 개별로 푸터를 렌더하는 방식은 채택하지 않는다 — ADR-0061 §Alternatives (c)와
 *   동일한 실패 모드(신규 라우트에서 누락)다. layout 1곳이 두 라우트를 덮는다.
 *
 * 헤더는 두지 않는다 — 쇼케이스는 `(reader)`의 AppHeader 대상이 아니며, 각 page가
 *   자체 `<header>` 제목 블록을 보유한다(기존 동작 불변).
 *
 * ★ 쇼케이스는 **검수용 임시 라우트**다(`components/app/app-header.tsx` 주석 —
 *   "검수용 임시 메뉴, 서비스 전환 시 제거 대상"). `app/showcase/` 삭제 시 본 파일도
 *   함께 제거한다(ADR-0061 D6 주의).
 *
 * ADR: docs/adr/0061-global-footer-legal-links.md D6
 */
export default function ShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <AppFooter />
    </>
  );
}
