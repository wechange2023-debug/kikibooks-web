'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

/**
 * 모바일(md 미만) 헤더 내비게이션 — 햄버거 버튼 + 드롭다운.
 *
 * 결정 근거: ADR-0024 Amendment O3(재정정, 2026-08-07) — 390px 실측에서 텍스트 4링크
 *   (홈·라이브러리·마이페이지·쇼케이스(검수용)) + 로그아웃이 한 줄에 들어가지 않는다.
 *   라벨 축약은 링크가 늘어날 때마다 재발하므로 표준 패턴(햄버거)으로 구조 해결한다.
 *   md 이상은 기존 텍스트 링크를 그대로 쓴다 — 본 컴포넌트는 md 미만에서만 렌더된다.
 *
 * AppHeader에서 분리한 이유:
 *   AppHeader는 이미 'use client'다(usePathname). 다만 몰입 화면 분기(ADR-0021 D3)에서
 *   **훅 선언보다 앞서 early return(null)** 을 하고 있어, 열림 상태 훅을 AppHeader에
 *   직접 넣으면 rules-of-hooks 위반을 피하려고 기존 분기 구조를 건드려야 한다.
 *   드롭다운만 떼어내면 검증 끝난 AppHeader의 early return을 그대로 보존할 수 있다.
 *
 * 닫힘 트리거 3종:
 *   - 링크 선택(onClick) — 이동 후 열린 채로 남지 않게.
 *   - 바깥 클릭(document mousedown) — 패널·버튼 밖을 눌렀을 때.
 *   - Esc 키 — reader-exit-guard.tsx의 keydown 처리 관용구와 동일 형태.
 *   세 리스너 모두 useEffect cleanup에서 해제한다.
 *
 * a11y:
 *   - 버튼: aria-expanded(열림 상태) + aria-controls(패널 id) + aria-label
 *     ("메뉴 열기" / "메뉴 닫기"). 아이콘은 aria-hidden — 의미는 aria-label 전담.
 *   - 패널: <nav aria-label="주요"> — 데스크톱 nav와 같은 라벨(동일 역할).
 *   - id는 useId()로 생성해 SSR/CSR 불일치를 피한다.
 *
 * 디자인 (Hard Rule 10 — semantic 토큰만, raw HEX 0건):
 *   - 버튼: border-outline + bg-surface + text-text-variant (로그아웃 버튼과 같은 톤)
 *   - 패널: rounded-md + border-outline + bg-surface + shadow-elev-2
 *   - 링크: 데스크톱 헤더 링크와 동일 활성/비활성 클래스
 */

/** 드롭다운 항목 1개 — active는 호출자(AppHeader)가 pathname으로 이미 판정해 넘긴다. */
export interface MobileNavItem {
  href: string;
  label: string;
  active: boolean;
}

interface MobileNavProps {
  items: MobileNavItem[];
}

export function MobileNav({ items }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  // 바깥 클릭 + Esc로 닫기. 닫혀 있을 때는 리스너를 붙이지 않는다.
  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const container = containerRef.current;
      if (container && !container.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-outline bg-surface text-text-variant transition-colors hover:bg-surface-2 hover:text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Menu className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      {open && (
        <nav
          id={panelId}
          aria-label="주요"
          className="absolute right-0 top-full z-50 mt-2 flex w-48 flex-col gap-1 rounded-md border border-outline bg-surface p-2 shadow-elev-2"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              onClick={() => setOpen(false)}
              className={
                item.active
                  ? 'rounded px-3 py-2 text-label font-medium bg-surface-2 text-text'
                  : 'rounded px-3 py-2 text-label font-medium text-text-variant hover:bg-surface-2 hover:text-text'
              }
            >
              {item.label}
            </Link>
          ))}

          {/* 로그아웃 — 데스크톱 헤더와 동일한 form POST(/auth/sign-out). */}
          <form action="/auth/sign-out" method="post" className="pt-1">
            <button
              type="submit"
              className="w-full rounded border border-outline bg-surface px-3 py-2 text-left text-label font-medium text-text-variant transition-colors hover:bg-surface-2 hover:text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              로그아웃
            </button>
          </form>
        </nav>
      )}
    </div>
  );
}
