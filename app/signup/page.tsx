import type { Metadata } from 'next';

import { SignupForm } from '@/components/auth/signup-form';

export const metadata: Metadata = {
  title: '회원가입 · 키키북스',
};

/** /signup — 회원가입 화면. 이미 로그인한 사용자는 middleware가 /home으로 보낸다. */
export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-2 px-6 py-12">
      <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-elev-2 sm:p-8">
        <header className="mb-6 flex flex-col gap-2 text-center">
          <h1 className="font-display text-xl font-semibold text-text">
            키키북스 시작하기
          </h1>
          <p className="text-sm text-text-variant">
            우리 아이의 영어 그림책 서재를 만들어요
          </p>
        </header>
        <SignupForm />
      </div>
    </main>
  );
}
