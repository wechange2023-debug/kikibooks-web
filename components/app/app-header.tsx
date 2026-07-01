'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { HOME_PATH, LIBRARY_PATH, SHOWCASE_PATH } from '@/lib/auth/routes';

/**
 * 공통 앱 헤더 — 로그인 후 화면(/home·/library·/book 상세)의 홈↔라이브러리 네비 + 로그아웃.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용 (ADR-0021)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - D2: 컨테이너는 layout으로 올리지 않는다. 본 컴포넌트가 자체 너비 컨테이너를
 *     가지며(본문 max-w-screen-* 정합), (reader)/layout.tsx는 <AppHeader/> + {children}만.
 *   - D3: 'use client' + usePathname 경로 분기. 책 읽기(/read)·완독(/celebrate)은
 *     유아 몰입 화면이라 헤더 미렌더(null). book not-found는 책 상세와 URL이 동일해
 *     (notFound()는 요청 URL 그대로 렌더) usePathname으로 구별 불가 → 헤더 노출 허용
 *     (404는 몰입 화면 아님, 네비 제공이 오히려 탈출 동선 UX 이득. PM 결정 2026-06-11).
 *   - D4: 홈↔라이브러리 Link 2개 + 로그아웃 form. 자녀 프로필칩 미포함(book에
 *     getActiveChild 추가 회피). 라이브러리 h1+subtitle은 본 헤더 미포함(page 본문 잔류).
 *
 * 활성 판정 패턴 (components/admin/admin-nav.tsx 직역):
 *   - home (/home): pathname === HOME_PATH 정확 매칭.
 *   - library (/library): pathname === LIBRARY_PATH 또는 그 하위(미래 /library/* 대비).
 *   - /book/[id] 상세: 둘 다 비활성(admin의 stats 비활성과 동형 — 활성 항목 없음 허용).
 *   - 활성: aria-current="page" + bg-surface-2 text-text / 비활성: text-text-variant hover.
 *
 * 라벨 정책 (자진 신고 5번 정합):
 *   "홈"·"라이브러리"·"로그아웃" hardcoded — 기존 3 page 로그아웃 form이 "로그아웃"을
 *   hardcode한 것과 동일 정책(copy.ts 박제 확장 회피). 향후 AppCopy 분리 시 props 이동.
 *
 * 토큰 재사용 (Hard Rule 10):
 *   - 헤더 바: border-b border-outline bg-surface (landing-header·admin layout 정합).
 *   - 컨테이너: mx-auto max-w-screen-sm md:max-w-screen-md lg:max-w-screen-lg px-4 md:px-6
 *     (home·library·book page 컨테이너 정합).
 *   - 로그아웃 button: home/library/book page 박제 직역(border-outline·bg-surface·
 *     text-text-variant + hover/focus 토큰). 신규 토큰·raw HEX 0건.
 *
 * ADR: docs/adr/0021-reader-route-group-and-app-header.md D2·D3·D4·D5
 */

/** 책 읽기(/read)·완독(/celebrate) 몰입 화면 — 헤더 미렌더 대상. 정확한 세그먼트 매칭. */
const IMMERSIVE_ROUTE_RE = /^\/book\/[^/]+\/(read|celebrate)$/;

interface NavLink {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
}

const NAV_LINKS: NavLink[] = [
  {
    href: HOME_PATH,
    label: '홈',
    isActive: (p) => p === HOME_PATH,
  },
  {
    href: LIBRARY_PATH,
    label: '라이브러리',
    isActive: (p) => p === LIBRARY_PATH || p.startsWith(`${LIBRARY_PATH}/`),
  },
  // 검수용 임시 메뉴 — 서비스 전환 시 제거 대상(app/showcase 삭제와 함께). 기존 항목 불변.
  {
    href: SHOWCASE_PATH,
    label: '쇼케이스(검수용)',
    isActive: (p) => p === SHOWCASE_PATH || p.startsWith(`${SHOWCASE_PATH}/`),
  },
];

export function AppHeader() {
  const pathname = usePathname();

  // D3 — 몰입 화면(/read·/celebrate)에서는 헤더 미렌더.
  if (IMMERSIVE_ROUTE_RE.test(pathname)) {
    return null;
  }

  return (
    <header className="border-b border-outline bg-surface">
      <div className="mx-auto flex h-14 max-w-screen-sm items-center justify-between px-4 md:max-w-screen-md md:px-6 lg:max-w-screen-lg">
        <nav aria-label="주요" className="flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const active = link.isActive(pathname);
            const linkClass = active
              ? 'rounded px-3 py-1.5 text-sm font-medium bg-surface-2 text-text'
              : 'rounded px-3 py-1.5 text-sm font-medium text-text-variant hover:bg-surface-2 hover:text-text';
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={linkClass}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            className="inline-flex items-center rounded-md border border-outline bg-surface px-2 py-1 text-xs font-medium text-text-variant transition-colors hover:bg-surface-2 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            로그아웃
          </button>
        </form>
      </div>
    </header>
  );
}
