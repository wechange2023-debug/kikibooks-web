import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: '로그인 오류 · 키키북스',
};

/**
 * /auth/auth-error — 인증 콜백 실패 안내.
 * (docs/intent/auth-flow.md 3절 라우트 지도)
 */
export default function AuthErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-2 px-6 py-12">
      <div className="w-full max-w-md rounded-xl bg-surface p-6 text-center shadow-elev-2 sm:p-8">
        <h1 className="font-display text-xl font-semibold text-text">
          로그인을 완료하지 못했어요
        </h1>
        <p className="mt-3 text-sm text-text-variant">
          인증 링크가 만료되었거나 올바르지 않습니다. 다시 로그인해 주세요.
        </p>
        <Button asChild size="lg" className="mt-6 w-full">
          <Link href="/login">로그인 화면으로</Link>
        </Button>
      </div>
    </main>
  );
}
