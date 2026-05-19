'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { ensureProfile } from '@/lib/auth/ensure-profile';
import { resolvePostLoginPath } from '@/lib/auth/resolve-post-login-path';
import { createClient } from '@/lib/supabase/server';

/**
 * 이메일 로그인·회원가입 서버 액션. /login·/signup 양쪽 폼이 사용한다.
 *
 * - 비밀번호는 서버 액션에서만 다룬다 (docs/intent/auth-flow.md 5절).
 * - 클라이언트 검증(RHF+zod)을 신뢰하지 않고 서버에서 다시 검증한다.
 * - Google 로그인은 브라우저 클라이언트가 처리한다 (components/auth/google-button.tsx).
 */

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type EmailAuthInput = {
  email: string;
  password: string;
};

/**
 * 이메일·비밀번호 로그인.
 * 성공 시 /home(자녀 있음) 또는 /onboarding(자녀 없음)으로 리다이렉트하므로 값을 반환하지 않는다.
 * 실패 시에만 에러 메시지를 돌려준다 (계정 존재 여부는 노출하지 않음 — auth-flow.md 4.2).
 */
export async function signInWithEmail(
  input: EmailAuthInput,
): Promise<{ error: string }> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
  }

  // 세션이 생겼으니 profiles 행을 보장하고, 자녀 유무로 도착 경로를 정한다
  // (auth-flow.md 4.4, onboarding-flow.md 4.1).
  await ensureProfile(supabase, data.user);
  redirect(await resolvePostLoginPath(supabase, data.user.id));
}

/**
 * 이메일·비밀번호 회원가입.
 * - 이메일 확인이 켜져 있으면 세션 없이 확인 메일이 발송된다 → needsEmailConfirmation.
 *   (이 경우 프로필 생성은 /auth/callback이 담당한다.)
 * - 이메일 확인이 꺼져 있으면 즉시 세션이 생긴다 → 프로필 보장 후 자녀 유무로 /home·/onboarding 분기.
 */
export async function signUpWithEmail(
  input: EmailAuthInput,
): Promise<{ error: string } | { needsEmailConfirmation: true }> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: '입력값을 다시 확인해 주세요. 비밀번호는 8자 이상이어야 합니다.',
    };
  }

  // 확인 메일의 인증 링크가 /auth/callback으로 돌아오도록 origin을 붙인다.
  const origin = headers().get('origin');
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: origin ? { emailRedirectTo: `${origin}/auth/callback` } : undefined,
  });

  if (error) {
    return {
      error: '회원가입에 실패했습니다. 입력값을 확인하고 잠시 후 다시 시도해 주세요.',
    };
  }

  // 세션이 즉시 생긴 경우(이메일 확인 꺼짐) → 프로필 보장 후 자녀 유무로 분기.
  if (data.session && data.user) {
    await ensureProfile(supabase, data.user);
    redirect(await resolvePostLoginPath(supabase, data.user.id));
  }

  // 세션이 없으면 확인 메일 발송 상태.
  return { needsEmailConfirmation: true };
}
