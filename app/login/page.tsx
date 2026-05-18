import type { Metadata } from 'next';

import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = {
  title: '로그인 · 키키북스',
};

/** /login — 로그인 화면. 이미 로그인한 사용자는 middleware가 /home으로 보낸다. */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-2 px-6 py-12">
      <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-elev-2 sm:p-8">
        <header className="mb-6 flex flex-col gap-2 text-center">
          <h1 className="font-display text-xl font-semibold text-text">
            다시 오신 걸 환영해요
          </h1>
          <p className="text-sm text-text-variant">키키북스 계정으로 로그인하세요</p>
        </header>
        <LoginForm />
      </div>
    </main>
  );
}
