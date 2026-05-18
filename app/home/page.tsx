import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: '홈 · 키키북스',
};

/**
 * /home — ★ 임시 플레이스홀더 화면.
 *
 * phase-07(인증)이 끝까지 동작하는지 눈으로 확인하기 위한 최소 화면이다.
 * phase-10(Screen 02 홈)에서 정식 홈으로 교체된다 — 화려하게 만들지 않는다.
 *
 * 보호 라우트라 middleware가 비로그인 사용자를 막지만, 안전망으로 한 번 더 확인한다.
 */
export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-2 px-6 py-12">
      <div className="w-full max-w-md rounded-xl bg-surface p-6 text-center shadow-elev-2 sm:p-8">
        <h1 className="font-display text-xl font-semibold text-text">로그인 성공</h1>
        <p className="mt-3 text-sm text-text-variant">
          로그인된 계정:{' '}
          <span className="font-semibold text-text">{user.email}</span>
        </p>

        <form action="/auth/sign-out" method="post" className="mt-6">
          <Button type="submit" variant="outline" size="lg" className="w-full">
            로그아웃
          </Button>
        </form>

        <p className="mt-6 rounded-md border border-outline bg-surface-2 px-4 py-3 text-sm text-text-variant">
          이 화면은 임시 화면입니다. phase-10에서 정식 홈으로 교체됩니다.
        </p>
      </div>
    </main>
  );
}
