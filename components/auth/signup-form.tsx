'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';

import { signUpWithEmail } from '@/app/login/actions';
import { GoogleButton } from '@/components/auth/google-button';
import { Button } from '@/components/ui/button';

const signupSchema = z.object({
  email: z.string().email('올바른 이메일 주소를 입력해 주세요.'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.'),
  passwordConfirm: z.string().min(1, '비밀번호를 한 번 더 입력해 주세요.'),
});

type SignupValues = z.infer<typeof signupSchema>;

// 입력 필드 — design-system.md 3.2(높이 52px·좌우 22px)·4.2(pill)·6.2(focus 시 border 색만 변경).
const fieldClass =
  'h-[52px] w-full rounded-pill border border-outline bg-surface px-[22px] text-sm text-text placeholder:text-text-disabled focus:border-primary focus:outline-none disabled:opacity-[0.38]';

/** 이메일 회원가입 폼 + Google 회원가입. (docs/intent/auth-flow.md 4.1·4.3절) */
export function SignupForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: '', password: '', passwordConfirm: '' },
  });

  const onSubmit = (values: SignupValues) => {
    setFormError(null);

    // 비밀번호 확인 일치 검사 (오타 방지).
    if (values.password !== values.passwordConfirm) {
      setError('passwordConfirm', { message: '비밀번호가 일치하지 않습니다.' });
      return;
    }

    startTransition(async () => {
      try {
        // 세션이 즉시 생기면 서버 액션이 /home으로 리다이렉트한다.
        const result = await signUpWithEmail({
          email: values.email,
          password: values.password,
        });
        if ('error' in result) {
          setFormError(result.error);
        } else {
          setEmailSent(true);
        }
      } catch {
        setFormError('회원가입 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      }
    });
  };

  // 확인 메일 발송 완료 화면.
  if (emailSent) {
    return (
      <div role="status" className="flex flex-col gap-4 text-center">
        <h2 className="font-display text-xl font-semibold text-text">
          메일함을 확인해 주세요
        </h2>
        <p className="text-sm text-text-variant">
          입력하신 이메일로 인증 링크를 보냈어요. 링크를 누르면 가입이 완료됩니다.
        </p>
        <Link
          href="/login"
          className="text-sm font-semibold text-primary hover:underline"
        >
          로그인 화면으로 가기
        </Link>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="signup-email" className="text-sm font-medium text-text">
          이메일
        </label>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          placeholder="parent@example.com"
          className={fieldClass}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'signup-email-error' : undefined}
          disabled={isPending}
          {...register('email')}
        />
        {errors.email && (
          <p id="signup-email-error" className="text-sm font-medium text-error">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="signup-password" className="text-sm font-medium text-text">
          비밀번호
        </label>
        <input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          placeholder="8자 이상"
          className={fieldClass}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? 'signup-password-error' : undefined}
          disabled={isPending}
          {...register('password')}
        />
        {errors.password && (
          <p id="signup-password-error" className="text-sm font-medium text-error">
            {errors.password.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="signup-password-confirm" className="text-sm font-medium text-text">
          비밀번호 확인
        </label>
        <input
          id="signup-password-confirm"
          type="password"
          autoComplete="new-password"
          placeholder="비밀번호 다시 입력"
          className={fieldClass}
          aria-invalid={Boolean(errors.passwordConfirm)}
          aria-describedby={
            errors.passwordConfirm ? 'signup-password-confirm-error' : undefined
          }
          disabled={isPending}
          {...register('passwordConfirm')}
        />
        {errors.passwordConfirm && (
          <p
            id="signup-password-confirm-error"
            className="text-sm font-medium text-error"
          >
            {errors.passwordConfirm.message}
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
        {isPending ? '가입 중…' : '회원가입'}
      </Button>

      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-outline" />
        <span className="text-sm font-medium text-text-variant">또는</span>
        <span className="h-px flex-1 bg-outline" />
      </div>

      <GoogleButton label="Google로 회원가입" />

      {/* phase-13: 카카오 회원가입 버튼 자리 (ADR-0009 결정 1 — 베타 이후 추가) */}

      <p className="pt-2 text-center text-sm text-text-variant">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          로그인
        </Link>
      </p>
    </form>
  );
}
