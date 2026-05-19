import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ChildProfileForm } from '@/components/onboarding/child-profile-form';
import { POST_LOGIN_PATH, SIGN_IN_PATH } from '@/lib/auth/routes';
import { hasChildren } from '@/lib/children/has-children';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: '자녀 프로필 등록 · 키키북스',
};

/**
 * /onboarding — 자녀 프로필 등록 화면 (phase-08).
 *
 * 보호 라우트라 middleware가 비로그인 사용자를 막지만, 서버 컴포넌트에서
 * 한 번 더 확인한다. 이미 자녀가 있으면 온보딩이 필요 없으므로 /home으로
 * 역가드한다 — 사용자가 URL을 직접 입력해 들어와도 중복 등록을 막는다
 * (ADR-0011 결정 1, docs/intent/onboarding-flow.md 4.2절).
 */
export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(SIGN_IN_PATH);
  }

  // 이미 자녀가 있으면 온보딩 불필요 → /home 역가드.
  if (await hasChildren(supabase, user.id)) {
    redirect(POST_LOGIN_PATH);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-2 px-6 py-12">
      <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-elev-2 sm:p-8">
        <header className="mb-6 flex flex-col gap-2 text-center">
          <h1 className="font-display text-xl font-semibold text-text">
            자녀를 등록해 주세요
          </h1>
          <p className="text-sm text-text-variant">
            아이에게 꼭 맞는 그림책을 추천하기 위해 정보가 필요해요
          </p>
        </header>
        <ChildProfileForm />
      </div>
    </main>
  );
}
