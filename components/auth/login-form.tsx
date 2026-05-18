'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';

import { signInWithEmail } from '@/app/login/actions';
import { GoogleButton } from '@/components/auth/google-button';
import { Button } from '@/components/ui/button';

const loginSchema = z.object({
  email: z.string().email('올바른 이메일 주소를 입력해 주세요.'),
  password: z.string().min(1, '비밀번호를 입력해 주세요.'),
});

type LoginValues = z.infer<typeof loginSchema>;

// 입력 필드 — design-system.md 3.2(높이 52px·좌우 22px)·4.2(pill)·6.2(focus 시 border 색만 변경).
const fieldClass =
  'h-[52px] w-full rounded-pill border border-outline bg-surface px-[22px] text-sm text-text placeholder:text-text-disabled focus:border-primary focus:outline-none disabled:opacity-[0.38]';

/** 이메일 로그인 폼 + Google 로그인. (docs/intent/auth-flow.md 4.2·4.3절) */
export function LoginForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = (values: LoginValues) => {
    setFormError(null);
    startTransition(async () => {
      try {
        // 성공 시 서버 액션이 /home으로 리다이렉트한다 (아래 코드는 실행되지 않음).
        const result = await signInWithEmail(values);
        if (result?.error) {
          setFormError(result.error);
        }
      } catch {
        setFormError('로그인 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      }
    });
  };

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="login-email" className="text-sm font-medium text-text">
          이메일
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          placeholder="parent@example.com"
          className={fieldClass}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'login-email-error' : undefined}
          disabled={isPending}
          {...register('email')}
        />
        {errors.email && (
          <p id="login-email-error" className="text-sm font-medium text-error">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="login-password" className="text-sm font-medium text-text">
          비밀번호
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          placeholder="비밀번호"
          className={fieldClass}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? 'login-password-error' : undefined}
          disabled={isPending}
          {...register('password')}
        />
        {errors.password && (
          <p id="login-password-error" className="text-sm font-medium text-error">
            {errors.password.message}
          </p>
        )}
      </div>

      {formError && (
        <p
          role="alert"
          className="rounded-md border border-outline bg-surface-2 px-4 py-3 text-sm font-medium text-error"
        >
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? '로그인 중…' : '로그인'}
      </Button>

      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-outline" />
        <span className="text-sm font-medium text-text-variant">또는</span>
        <span className="h-px flex-1 bg-outline" />
      </div>

      <GoogleButton label="Google로 로그인" />

      {/* phase-13: 카카오 로그인 버튼 자리 (ADR-0009 결정 1 — 베타 이후 추가) */}

      <p className="pt-2 text-center text-sm text-text-variant">
        아직 계정이 없으신가요?{' '}
        <Link href="/signup" className="font-semibold text-primary hover:underline">
          회원가입
        </Link>
      </p>
    </form>
  );
}
