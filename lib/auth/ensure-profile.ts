import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * 로그인한 사용자의 profiles 행을 보장한다 (앱-레벨 idempotent upsert).
 *
 * - 행이 없으면 새로 만들고, 있으면 그대로 둔다 (ignoreDuplicates).
 * - 사용자 본인 세션 클라이언트로 호출되므로 001 스키마의 RLS 정책
 *   "users can insert own profile"을 그대로 통과한다 — 권한·스키마 변경 불필요.
 * - 여러 번 호출돼도 안전하다. /auth/callback(3-3)과 이메일 로그인/회원가입
 *   서버 액션(3-2) 양쪽에서 호출된다.
 *
 * 결정 근거: docs/adr/0009-auth-architecture.md 3.2절 (DB 트리거 미채택)
 * 사용자 흐름: docs/intent/auth-flow.md 4.4절
 */
export async function ensureProfile(
  supabase: SupabaseClient,
  user: User,
): Promise<void> {
  // profiles.email은 NOT NULL — 이메일 없는 사용자는 프로필을 만들 수 없다.
  // 이메일·Google 로그인은 항상 email을 제공하므로 정상 경로에서는 발생하지 않는다.
  if (!user.email) {
    throw new Error(
      `ensureProfile: 사용자(${user.id})에 이메일이 없어 profiles 행을 만들 수 없습니다.`,
    );
  }

  const { error } = await supabase
    .from('profiles')
    .upsert(
      { id: user.id, email: user.email },
      { onConflict: 'id', ignoreDuplicates: true },
    );

  if (error) {
    throw new Error(`ensureProfile: profiles upsert 실패 — ${error.message}`);
  }
}
