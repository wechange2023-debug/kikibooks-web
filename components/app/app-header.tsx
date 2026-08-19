'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { MobileNav } from '@/components/app/mobile-nav';
import {
  HOME_PATH,
  LIBRARY_PATH,
  MYPAGE_PATH,
  SHOWCASE_PATH,
  isImmersiveRoute,
} from '@/lib/auth/routes';
import { BRAND_NAME } from '@/lib/brand';

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
 * 반응형 (ADR-0024 Amendment O3 재정정, 2026-08-07):
 *   링크가 4개(홈·라이브러리·마이페이지·쇼케이스(검수용))로 늘어 390px 실측에서 텍스트
 *   내비 + 로그아웃이 한 줄에 들어가지 않는다. **md 미만은 텍스트 내비·로그아웃을 숨기고
 *   우측 햄버거 드롭다운(components/app/mobile-nav.tsx)으로 전환**하고, md 이상은 기존
 *   텍스트 4링크를 그대로 유지한다. 라벨 축약안은 링크 증가 시 재발하므로 폐기됐다.
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

// 몰입 화면 판정은 lib/auth/routes.ts의 isImmersiveRoute로 이관했다 —
// AppFooter가 같은 판정을 써야 하고, 복제하면 한쪽만 고쳐지는 순간 헤더는 숨고
// 푸터는 남는 상태가 된다(ADR-0061 D4).

interface NavLink {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
}

const NAV_LINKS: NavLink[] = [
  {
    href: HOME_PATH,
    label: '홈',
    // ★ ADR-0062 O-M4 확정 — **정확 일치만 쓴다.** HOME_PATH가 '/'이므로
    //   startsWith로 바꾸면 모든 경로에서 홈이 활성이 된다. 아래 라이브러리·
    //   마이페이지처럼 startsWith를 덧붙이지 말 것.
    isActive: (p) => p === HOME_PATH,
  },
  {
    href: LIBRARY_PATH,
    label: '라이브러리',
    isActive: (p) => p === LIBRARY_PATH || p.startsWith(`${LIBRARY_PATH}/`),
  },
  // 마이페이지 (ADR-0024 D6 + Amendment O3) — 진입 동선이 없으면 화면에 도달 불가.
  // ※ Amendment O3: 쇼케이스(검수용) 포함 총 4링크가 된다. 쇼케이스는 팀장 검수에
  //   사용 중이라 제거하지 않는다. 390px에서 넘치면 1순위 대응은 라벨 축약.
  {
    href: MYPAGE_PATH,
    label: '마이페이지',
    isActive: (p) => p === MYPAGE_PATH || p.startsWith(`${MYPAGE_PATH}/`),
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

  // D3 — 몰입 화면(/read·/celebrate)에서는 헤더 미렌더. AppFooter와 같은 판정을 쓴다.
  if (isImmersiveRoute(pathname)) {
    return null;
  }

  return (
    <header className="border-b border-outline bg-surface">
      <div className="mx-auto flex h-14 max-w-screen-sm items-center justify-between px-4 md:max-w-screen-md md:px-6 lg:max-w-screen-lg">
        {/* 좌측 그룹 — 로고 + (md 이상) 텍스트 내비. md 미만에서는 로고만 남는다. */}
        <div className="flex items-center gap-4">
          {/* 브랜드 로고 — 랜딩 헤더(landing-header.tsx) 선례 그대로: font-display +
              font-bold + text-primary. 모바일은 한 단계 축소해 햄버거와 한 줄에 넣는다. */}
          <Link
            href={HOME_PATH}
            aria-label="홈으로"
            className="font-display text-body font-bold text-primary transition-colors duration-200 ease-kiki hover:text-primary-hover md:text-h2"
          >
            {BRAND_NAME}
          </Link>

          {/* 데스크톱(md 이상) — 기존 텍스트 링크 그대로. md 미만은 MobileNav가 대신한다. */}
          <nav aria-label="주요" className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => {
              const active = link.isActive(pathname);
              const linkClass = active
                ? 'rounded px-3 py-1.5 text-label font-medium bg-surface-2 text-text'
                : 'rounded px-3 py-1.5 text-label font-medium text-text-variant hover:bg-surface-2 hover:text-text';
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
        </div>

        {/* 우측 그룹 — md 이상 로그아웃, md 미만 햄버거. 컨테이너 justify-between이
            좌측 그룹과 갈라놓으므로 ml-auto가 필요 없다. */}
        <div className="flex items-center">
          <form action="/auth/sign-out" method="post" className="hidden md:block">
            <button
              type="submit"
              className="inline-flex items-center rounded-md border border-outline bg-surface px-2 py-1 text-caption font-medium text-text-variant transition-colors hover:bg-surface-2 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              로그아웃
            </button>
          </form>

          <MobileNav
            items={NAV_LINKS.map((link) => ({
              href: link.href,
              label: link.label,
              active: link.isActive(pathname),
            }))}
          />
        </div>
      </div>
    </header>
  );
}
