'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { POST_LOGIN_PATH } from '@/lib/auth/routes';
import {
  MAX_AGE,
  MAX_LEVEL,
  MIN_AGE,
  MIN_LEVEL,
} from '@/lib/levels/age-to-level';
import { createClient } from '@/lib/supabase/server';

/**
 * 자녀 프로필 등록 서버 액션. /onboarding 폼이 사용한다.
 *
 * - 입력은 클라이언트 검증(RHF+zod)을 신뢰하지 않고 서버에서 다시 검증한다.
 * - children.parent_id는 클라이언트 입력이 아니라 본인 세션의 user.id로 채운다.
 *   사용자 본인 세션 클라이언트라 001 스키마 RLS "parents can insert own children"
 *   (parent_id = auth.uid())을 그대로 통과한다 — RLS 우회 없음 (Hard Rule 6).
 * - 성공 시 /home으로 리다이렉트하므로 값을 반환하지 않는다. 실패 시에만 에러
 *   메시지를 돌려준다 (폼이 화면에 표시 — 페이지를 이탈하지 않는다).
 *
 * 사용자 흐름: docs/intent/onboarding-flow.md 4.1·4.4절
 */

const childProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '자녀 이름을 입력해 주세요.')
    .max(20, '이름은 20자 이하로 입력해 주세요.'),
  age: z.number().int().min(MIN_AGE).max(MAX_AGE),
  level: z.number().int().min(MIN_LEVEL).max(MAX_LEVEL),
});

export type ChildProfileInput = z.infer<typeof childProfileSchema>;

export async function registerChild(
  input: ChildProfileInput,
): Promise<{ error: string }> {
  const parsed = childProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: '입력값을 다시 확인해 주세요. 이름·나이·레벨을 모두 입력했는지 확인해 주세요.',
    };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.' };
  }

  // parent_id는 클라이언트 입력이 아니라 본인 세션의 user.id (RLS WITH CHECK 통과).
  const { error } = await supabase.from('children').insert({
    parent_id: user.id,
    name: parsed.data.name,
    age: parsed.data.age,
    current_level: parsed.data.level,
  });

  if (error) {
    return {
      error: '자녀 정보 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }

  redirect(POST_LOGIN_PATH);
}
