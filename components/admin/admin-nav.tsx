'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { AdminCopy } from '@/lib/admin/copy';

/**
 * /admin 사이드/탑 네비 — phase-13b CP2-b CP2-admin-foundation.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용 (CP1-adr)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - ADR-0019 D13: stats 별도 페이지 미생성 + /admin 홈 통합. nav의 stats 링크는
 *     '/admin#stats' anchor로 박제 — 같은 페이지의 통계 섹션으로 scroll. 활성 표시는
 *     home과 path를 공유하므로 stats는 항상 비활성(home 단독 활성, UX 충돌 회피).
 *   - ADR-0019 D22: 햄버거 메뉴 미적용. 모바일·데스크탑 모두 탑 네비 가로 스크롤.
 *     사이드 분리 0건(베타 단순성). 향후 메뉴 5개 이상 확장 시 햄버거 재검토.
 *   - intent §5.2: "사이드/탑 네비 4링크(홈·책·사용자·통계)" — 4링크 박제 유지.
 *
 * Client Component 분리 사유:
 *   - usePathname()은 'use client'에서만 호출 가능(next/navigation).
 *   - layout(app/admin/layout.tsx)은 Server Component로 유지하면서 nav 활성 판정만
 *     Client로 격리한다(translation: data fetching·gate은 server, UI 상태만 client).
 *
 * 활성 판정 정책:
 *   - home (/admin): pathname === '/admin' 정확 매칭. /admin/books·/admin/users
 *     prefix 매칭 회피.
 *   - books (/admin/books): pathname === '/admin/books' 또는 그 하위 경로(미래
 *     /admin/books/[id] 같은 상세 페이지 도입 대비).
 *   - users (/admin/users): 위와 동일 패턴.
 *   - stats (/admin#stats): D13 — home과 path 공유라 활성 표시 0건. anchor scroll만.
 *
 * 토큰 재사용 (Hard Rule 10):
 *   - 컨테이너: rounded-md border border-outline bg-surface shadow-elev-1
 *     (home/page.tsx aside 카드 패턴 정합).
 *   - 활성: bg-surface-2 + text-text (활성 강조).
 *   - 비활성: text-text-variant + hover:bg-surface-2 + hover:text-text.
 *   - 신규 토큰·raw HEX 0건.
 *
 * 카피 단일 출처:
 *   - 4링크 라벨은 props.copy(AdminCopy['nav'])로 주입. 본 컴포넌트는 라벨 hardcoded 0건.
 *   - nav 자체 aria-label은 박제 0건이라 "관리" 한 단어 hardcoded — 미래 박제 확장
 *     (AdminCopy.nav.ariaLabel 추가) 시 copy로 이동.
 *
 * ADR: docs/adr/0019-admin-system.md D13·D22
 * 의도 문서: docs/intent/admin-system.md §5.2
 */

interface AdminNavLink {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
}

interface AdminNavProps {
  copy: AdminCopy['nav'];
}

export function AdminNav({ copy }: AdminNavProps) {
  const pathname = usePathname();

  const links: AdminNavLink[] = [
    {
      href: '/admin',
      label: copy.home,
      isActive: (p) => p === '/admin',
    },
    {
      href: '/admin/books',
      label: copy.books,
      isActive: (p) => p === '/admin/books' || p.startsWith('/admin/books/'),
    },
    {
      href: '/admin/users',
      label: copy.users,
      isActive: (p) => p === '/admin/users' || p.startsWith('/admin/users/'),
    },
    {
      // ADR-0051 구현 2 — /admin/review 검수 화면 링크 1개 추가(intent §5.2 "4링크" 박제 확장).
      // 라벨 hardcoded 사유: AdminCopy['nav']는 home·books·users·stats·logout 고정 키라
      // review 키 추가 = lib/admin/copy.ts 수정이 선결이다. 본 구현 2는 3파일 범위라
      // 임시 hardcoded로 두고 copy.ts 편입은 백로그 유지(ADR-0051 Backlog).
      href: '/admin/review',
      label: '검수',
      isActive: (p) => p === '/admin/review' || p.startsWith('/admin/review/'),
    },
    {
      // D13 — stats 별도 페이지 미생성. /admin 홈 #stats 섹션 anchor scroll.
      // 활성 표시는 home과 path 공유라 항상 false(UX 충돌 회피).
      href: '/admin#stats',
      label: copy.stats,
      isActive: () => false,
    },
  ];

  return (
    <nav
      aria-label="관리"
      className="flex gap-1 overflow-x-auto rounded-md border border-outline bg-surface p-1 shadow-elev-1"
    >
      {links.map((link) => {
        const active = link.isActive(pathname);
        const linkClass = active
          ? 'shrink-0 rounded px-3 py-1.5 text-sm font-medium bg-surface-2 text-text'
          : 'shrink-0 rounded px-3 py-1.5 text-sm font-medium text-text-variant hover:bg-surface-2 hover:text-text';
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
  );
}
