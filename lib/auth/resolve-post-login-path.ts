import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { ONBOARDING_PATH, POST_LOGIN_PATH } from '@/lib/auth/routes';
import { hasSkippedOnboarding } from '@/lib/child-optional/skip';
import { hasChildren } from '@/lib/children/has-children';

/**
 * 로그인이 막 완료된 시점에 사용자를 어디로 보낼지 결정한다.
 *
 *  - 자녀가 한 명이라도 있으면        → POST_LOGIN_PATH('/', ADR-0062 D3)
 *  - 자녀 0명 + 온보딩을 건너뛴 적 없음 → ONBOARDING_PATH('/onboarding')
 *  - 자녀 0명 + 이미 건너뛴 적 있음    → POST_LOGIN_PATH('/', ADR-0064 D2)
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * ★ 자녀 등록은 필수가 아니다 (ADR-0064 **D2**, 2026-08-20)
 * ──────────────────────────────────────────────────────────────────────────────
 *   종전에는 자녀 0명이면 **항상** `/onboarding`으로 보냈고, 그것이 자녀 등록을
 *   사실상 필수로 만들었다. ADR-0064 A안이 이를 뒤집는다 — 온보딩은 **없어지지 않고
 *   첫 만남에만 남는다.** 한 번 "나중에 할게요"를 누른 사람을 매 로그인마다 같은
 *   화면으로 되돌리지 않는다.
 *
 *   스킵 기록은 **쿠키**다(D3 — `lib/child-optional/skip.ts`). `profiles` 컬럼을 쓰지
 *   않으므로 DB 스키마 변경이 없고 Hard Rule 8이 발동하지 않는다. 기기 단위라는
 *   한계는 `skip.ts` JSDoc에 명시돼 있다.
 *
 *   ★ **본 함수가 D2의 단일 수정점이다.** 호출부 3곳(`app/login/actions.ts:67`·`:104`,
 *     `app/auth/callback/route.ts:38`)은 이 함수 하나만 고치면 전부 따라온다 —
 *     호출부를 개별 수정하지 않는다.
 *
 * 이 분기는 로그인 도착 지점(/auth/callback, 이메일 로그인/회원가입 서버 액션)
 * 에서만 1회 호출된다. middleware.ts는 이 판정을 하지 않는다 — 매 요청 DB
 * 조회를 피하고 "미들웨어는 화면 가드"라는 phase-07 철학을 유지한다
 * (ADR-0011 결정 1, docs/intent/auth-flow.md 4.5절). ADR-0064도 이 원칙을
 * 유지한 채 **도착 지점의 분기 내용만** 바꾼다.
 *
 * 사용자 흐름: docs/intent/onboarding-flow.md 4.1·4.2절
 * ADR: docs/adr/0064-child-optional-registration.md D2·D3
 */
export async function resolvePostLoginPath(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  if (await hasChildren(supabase, userId)) {
    return POST_LOGIN_PATH;
  }

  // 자녀 0명 — 이미 한 번 건너뛴 사람은 되돌리지 않는다(ADR-0064 D2).
  // 쿠키 조회는 DB 왕복이 아니므로 자녀 있는 경로의 비용은 그대로다.
  return hasSkippedOnboarding() ? POST_LOGIN_PATH : ONBOARDING_PATH;
}
