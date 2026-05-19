import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { ONBOARDING_PATH, POST_LOGIN_PATH } from '@/lib/auth/routes';
import { hasChildren } from '@/lib/children/has-children';

/**
 * 로그인이 막 완료된 시점에 사용자를 어디로 보낼지 결정한다.
 *
 *  - 자녀가 한 명이라도 있으면 → POST_LOGIN_PATH('/home')
 *  - 자녀가 없으면          → ONBOARDING_PATH('/onboarding')
 *
 * 이 분기는 로그인 도착 지점(/auth/callback, 이메일 로그인/회원가입 서버 액션)
 * 에서만 1회 호출된다. middleware.ts는 이 판정을 하지 않는다 — 매 요청 DB
 * 조회를 피하고 "미들웨어는 화면 가드"라는 phase-07 철학을 유지한다
 * (ADR-0011 결정 1, docs/intent/auth-flow.md 4.5절).
 *
 * 사용자 흐름: docs/intent/onboarding-flow.md 4.1·4.2절
 */
export async function resolvePostLoginPath(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const childExists = await hasChildren(supabase, userId);
  return childExists ? POST_LOGIN_PATH : ONBOARDING_PATH;
}
