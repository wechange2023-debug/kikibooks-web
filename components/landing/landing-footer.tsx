import Link from 'next/link';

import type { LandingCopy } from '@/lib/landing/copy';

/**
 * 랜딩 푸터 — 약관·개인정보 링크 + 회사 정보 + CC BY 안내 + 저작권.
 *
 * 서버 컴포넌트. CC BY 안내 문구(attributionNotice)는 표지를 노출하는
 * 화면의 어트리뷰션 하한선이다 (ADR-0013 결정 2). 4요소 완전 표시 의무는
 * 책 상세 페이지가 진다 (ADR-0013 결정 3, phase-11).
 *
 * /terms·/privacy 라우트는 CP4에서 생성된다.
 */
interface LandingFooterProps {
  brandName: string;
  copy: LandingCopy['footer'];
}

export function LandingFooter({ brandName, copy }: LandingFooterProps) {
  return (
    <footer className="border-t border-outline bg-surface-2 px-5 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <p className="font-display text-lg font-bold text-primary">
          {brandName}
        </p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link
            href="/terms"
            className="text-text-variant transition-colors duration-200 ease-kiki hover:text-text"
          >
            {copy.termsLabel}
          </Link>
          <Link
            href="/privacy"
            className="text-text-variant transition-colors duration-200 ease-kiki hover:text-text"
          >
            {copy.privacyLabel}
          </Link>
        </nav>
        <p className="text-sm text-text-variant">{copy.companyName}</p>
        <p className="text-xs text-text-variant">{copy.attributionNotice}</p>
        <p className="text-xs text-text-disabled">{copy.copyright}</p>
      </div>
    </footer>
  );
}
