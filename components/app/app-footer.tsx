'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { isImmersiveRoute } from '@/lib/auth/routes';
import { BRAND_NAME } from '@/lib/brand';
import {
  CC_BY_NOTICE,
  COMPANY_NAME,
  COPYRIGHT,
  PRIVACY_LABEL,
  PRIVACY_PATH,
  TERMS_LABEL,
  TERMS_PATH,
} from '@/lib/legal';

/**
 * 공통 푸터 — 약관·개인정보 링크 + CC BY 안내 1행.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용 (ADR-0061)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - D1: `(reader)` layout이 `{children}` **뒤**에 렌더한다. layout은 server
 *     component를 유지하고, 경로 분기는 본 컴포넌트가 'use client' + usePathname으로
 *     자체 처리한다 — ADR-0021 D3(AppHeader)의 책임 분리를 그대로 준용.
 *   - D2: /terms·/privacy 링크 + CC BY 안내 1행. 문구 변경 0건.
 *   - D4: 몰입 화면(/read·/celebrate) 미렌더. 정규식은 AppHeader와 **같은 상수**를
 *     쓴다(lib/auth/routes.ts isImmersiveRoute) — 복제 금지.
 *   - D6: /showcase 계열도 같은 컴포넌트를 재사용한다(app/showcase/layout.tsx).
 *     표지를 노출하는 표면이라 ADR-0013 결정 2의 CC BY 하한선이 적용된다.
 *
 * 배경 실측(ADR-0061 §Context 1): 이 컴포넌트 이전에는 /terms·/privacy 링크가
 *   `components/landing/landing-footer.tsx` **1곳뿐**이라, 로그인 이후 사용자는
 *   랜딩으로 되돌아가지 않는 한 약관에 도달할 수 없었다.
 *
 * ★ 사업자 정보·저작권 표기 (ADR-0062 **O-M3 확정**, 2026-08-19):
 *   v1에서 랜딩 푸터 전용이던 두 항목을 본 컴포넌트로 이관해 **전 화면에 노출**한다.
 *   `LandingFooter`는 폐기되고 `/`도 본 컴포넌트를 쓴다(ADR-0062 D5).
 *   ADR-0061 O-F2("유료 결제 도입 시 재검토")를 여기서 해소한다.
 *
 * 디자인 (design-system v2): 상단 구분선 border-outline(장식용) + bg-surface-2 웜크림,
 *   링크 text-label + text-text-variant → hover text-text, 안내문 text-caption.
 *   링크 터치 타깃은 §6.5 하한 44px를 만족시킨다(min-h-11 = 44px).
 */
export function AppFooter() {
  const pathname = usePathname();

  // D4 — 몰입 화면에서는 미렌더. 리더는 h-screen 고정 레이아웃이라 푸터가 들어가면
  // 본문 높이 계산이 깨지고, /read는 이미 자체 <footer>(완독 버튼)를 보유한다.
  if (isImmersiveRoute(pathname)) {
    return null;
  }

  return (
    <footer className="border-t border-outline bg-surface-2 px-4 py-6 md:px-6">
      <div className="mx-auto flex max-w-screen-sm flex-col gap-3 md:max-w-screen-md lg:max-w-screen-lg">
        <p className="font-display text-h3 text-primary">{BRAND_NAME}</p>
        <nav aria-label="법적 고지" className="flex flex-wrap items-center gap-x-5">
          <Link
            href={TERMS_PATH}
            className="inline-flex min-h-11 items-center text-label text-text-variant transition-colors duration-200 ease-kiki hover:text-text"
          >
            {TERMS_LABEL}
          </Link>
          <Link
            href={PRIVACY_PATH}
            className="inline-flex min-h-11 items-center text-label text-text-variant transition-colors duration-200 ease-kiki hover:text-text"
          >
            {PRIVACY_LABEL}
          </Link>
        </nav>
        <p className="text-label text-text-variant">{COMPANY_NAME}</p>
        <p className="break-keep text-caption font-normal text-text-variant">
          {CC_BY_NOTICE}
        </p>
        <p className="text-caption font-normal text-text-disabled">{COPYRIGHT}</p>
      </div>
    </footer>
  );
}
