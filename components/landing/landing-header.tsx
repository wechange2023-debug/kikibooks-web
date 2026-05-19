import Link from 'next/link';

import { Button } from '@/components/ui/button';
import type { LandingCopy } from '@/lib/landing/copy';

/**
 * 랜딩 헤더 — 로고 + 로그인 링크 + 가입 CTA.
 *
 * 서버 컴포넌트. 카피는 app/page.tsx가 getLandingCopy()로 받아 props로
 * 내려준다 (ADR-0012 결정 2 — 컴포넌트는 LANDING_COPY를 직접 import하지 않는다).
 */
interface LandingHeaderProps {
  brandName: string;
  copy: LandingCopy['header'];
}

export function LandingHeader({ brandName, copy }: LandingHeaderProps) {
  return (
    <header className="border-b border-outline bg-surface">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <Link
          href="/"
          className="font-display text-xl font-bold text-primary"
        >
          {brandName}
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">{copy.loginLabel}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">{copy.signupLabel}</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
