import { AppFooter } from '@/components/app/app-footer';
import { AppHeader } from '@/components/app/app-header';

/**
 * (reader) route group 레이아웃 — 로그인 후 화면(/home·/library·/book) 공통 헤더 주입.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용 (ADR-0021)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - D1: 괄호 route group이라 URL 미반영(/home·/library·/book/[id] 불변).
 *   - D2: 컨테이너(<main>·max-w div)를 layout으로 올리지 않는다. 각 page가 자체
 *     컨테이너를 보유한다. 사유: read(<main flex-1 overflow-hidden>)·celebrate
 *     (<main min-h-screen justify-center>)는 자체 풀스크린 <main>이라 layout이 좁은
 *     컨테이너를 강제하면 중첩·충돌. 따라서 layout은 헤더 바만 제공.
 *   - D3: AppHeader가 'use client' + usePathname으로 /read·/celebrate에서 null 반환.
 *     본 layout은 server component 유지(헤더 분기는 AppHeader 책임).
 *
 * 적용 대상(D1 세그먼트 공유): /home · /library · /mypage · /book/[id] 및 그 하위
 *   read·celebrate·not-found 전부. 몰입 화면(read·celebrate) 헤더 차단은 AppHeader가 담당.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 공통 푸터 (ADR-0061 D1)
 * ──────────────────────────────────────────────────────────────────────────────
 *   AppFooter를 `{children}` **뒤**에 둔다. D2(각 page가 자체 컨테이너 보유)에 따라
 *   layout은 헤더·푸터 바만 제공하며 컨테이너를 강제하지 않는다.
 *   몰입 화면 차단은 AppHeader와 동일하게 AppFooter가 자체 처리한다(ADR-0061 D4,
 *   isImmersiveRoute 공용 상수 공유). 본 layout은 server component를 유지한다.
 *
 * ADR: docs/adr/0021-reader-route-group-and-app-header.md D1·D2·D3
 *      docs/adr/0061-global-footer-legal-links.md D1·D4
 */
export default function ReaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AppHeader />
      {children}
      <AppFooter />
    </>
  );
}
