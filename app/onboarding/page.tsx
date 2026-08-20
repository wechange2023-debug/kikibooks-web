import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ChildProfileForm } from '@/components/onboarding/child-profile-form';
import { skipOnboarding } from '@/app/onboarding/actions';
import { POST_LOGIN_PATH, SIGN_IN_PATH } from '@/lib/auth/routes';
import { getChildOptionalCopy } from '@/lib/child-optional/copy';
import { hasChildren } from '@/lib/children/has-children';
import { createClient } from '@/lib/supabase/server';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
  title: `자녀 프로필 등록 · ${BRAND_NAME}`,
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

  const copy = await getChildOptionalCopy();

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-2 px-6 py-12">
      <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-elev-2 sm:p-8">
        <header className="mb-6 flex flex-col gap-2 text-center">
          <h1 className="font-display text-h2 font-semibold text-text">
            자녀를 등록해 주세요
          </h1>
          <p className="text-label text-text-variant">
            아이에게 꼭 맞는 그림책을 추천하기 위해 정보가 필요해요
          </p>
        </header>
        <ChildProfileForm />

        {/*
          ADR-0064 D3 — "나중에 할게요". 폼 **밖**에 둔다:
            - `child-profile-form.tsx` 무수정(조사 A안) — 공유 폼에 분기를 넣지 않는다
            - `<form>` 중첩은 HTML상 불가 — ChildProfileForm의 form과 **형제**로 놓는다
            - design-system §6.1 Text 버튼이라 "화면당 CTA 1개"는 폼 제출 버튼이 그대로 가진다
          터치 타깃은 `min-h-11`(44px, §6.5). 클릭 시 스킵 쿠키를 심고 `/`로 간다.
        */}
        <form action={skipOnboarding} className="mt-4 flex justify-center">
          <button
            type="submit"
            aria-label={copy.onboardingSkip.ariaLabel}
            className="inline-flex min-h-11 items-center rounded-pill px-4 text-label font-semibold text-text-variant transition-colors duration-200 ease-kiki hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
          >
            {copy.onboardingSkip.linkLabel}
          </button>
        </form>
      </div>
    </main>
  );
}
