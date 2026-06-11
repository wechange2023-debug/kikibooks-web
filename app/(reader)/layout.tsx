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
 * 적용 대상(D1 세그먼트 공유): /home · /library · /book/[id] 및 그 하위 read·celebrate·
 *   not-found 전부. 몰입 화면(read·celebrate) 헤더 차단은 AppHeader가 담당.
 *
 * ADR: docs/adr/0021-reader-route-group-and-app-header.md D1·D2·D3
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
    </>
  );
}
