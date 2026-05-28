'use server';

import { getActiveChild } from '@/lib/home/active-child';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

/**
 * 완독 보상 server action — Screen 05 완독 흐름의 보상 적립(ADR-0018 D1~D9).
 *
 * completeReadingSession(lib/book/reading-session.ts)이 reading_sessions의 1행 UPDATE
 * 성공 직후(완독 전이 = 멱등 앵커, D3) redirect 직전에 본 action을 호출한다. 클라이언트
 * (FinishButton)는 본 action을 직접 호출하지 않으며 보상의 존재를 모른다(D4 분리).
 *
 * 옵션 B (D1 — child_badges INSERT는 시스템이 책임):
 *   001 §9.6은 child_badges에 SELECT 정책만 두고 "INSERT는 시스템이 책임"으로 박제한다
 *   (line 293). 본인 세션 INSERT는 RLS가 거부하므로 createServiceRoleClient(secret 키,
 *   RLS 우회)로 쓴다. Hard Rule 6 — secret 키는 본 server action 내부에서만 쓰이고,
 *   lib/supabase/server.ts가 import 'server-only'로 클라이언트 번들 포함 시 빌드를
 *   실패시킨다. ADR-0003 §2 '서버 전용. cron·시드·관리자 라우트' 정합.
 *
 * 4.5중 안전망 (D2 — secret 키 쓰기 server action 표준):
 *   ① 입력 검증(zod) — 본 action은 인자 0건(D8)이라 zod schema가 불요하다. 신뢰 경계는
 *      ②③의 auth·소유권 검증이 책임진다(향후 인자 추가 시 zod 단계를 복원).
 *   ② auth.getUser() — 본인 세션 인증 가드.
 *   ③ getActiveChild(본인 세션·RLS 001 §9.3 parent_id=auth.uid()) — child_id 소유권을
 *      RLS로 검증한다. 이후 secret 키 쓰기에 넘기는 child.id는 "본인 자녀임이 보증된" 값.
 *   ④ createServiceRoleClient 쓰기 — ③에서 검증된 child.id로만 children.points UPDATE +
 *      child_badges INSERT. RLS 우회는 이 쓰기 문장에만 국한된다.
 *   ⑤(0.5) child 소유권은 ③에서 RLS로 이미 검증되므로, secret 키가 자녀 격리(Hard Rule 6
 *      핵심)를 깨지 않는다 — phase-12 5중 안전망 박제 본질과 충돌 0건. 차이는 단 하나:
 *      reading-session.ts의 5번째 망(쓰기 자체의 RLS)이 여기서는 ③의 child_id 출처 검증으로
 *      대체된다(secret 키가 RLS를 우회하므로).
 *
 * 시그니처 (D8 인자 0건):
 *   내부에서 auth + getActiveChild로 컨텍스트를 재해소한다. completeReadingSession의
 *   호출 인자에 의존하지 않아 신뢰 경계가 단순하다. 반환은 /celebrate 표시용
 *   (pointsAwarded·badgeCode·badgeNewlyEarned, CP2-e 활용).
 *
 * points 적립 (D5 매 완독 +50):
 *   getActiveChild의 ActiveChild는 points를 SELECT하지 않으므로(active-child.ts), 검증된
 *   child.id로 admin이 현재 points를 별도 SELECT한 뒤 +50 UPDATE한다. SELECT-then-UPDATE는
 *   비-atomic이나, 매 완독은 단일 자녀의 순차 액션이라 동시 +50 race가 거의 없다(베타 수용).
 *   재독 시 새 reading_session의 완독 전이마다 +50 누적(phase-12 재진입 신규 INSERT 정합).
 *
 * 배지 (D6 first_completion + onConflict ignore):
 *   badge_code='first_completion' 단일. UNIQUE(child_id, badge_code)(001 line 159)가
 *   DB 레벨 1회 방어다. upsert ignoreDuplicates로 재완독 시 충돌을 무시하고(0행 반환),
 *   badgeNewlyEarned로 신규 획득(1행) vs 기존 보유(0행)를 구분한다.
 *
 * 실패 처리 (D9 옵션 A — rollback 0건):
 *   points UPDATE 실패 시 즉시 ok:false(badge 미시도). badge 진짜 에러 시 ok:false. 부분
 *   성공(points +50 됐으나 badge 실패)도 ok:false로 전체 실패를 반환하되, points·
 *   reading_sessions는 롤백하지 않는다(완독 사실 보존). completeReadingSession이 본 결과를
 *   try-catch로 흡수하고 redirect는 진행한다(D9). UNIQUE 충돌은 INSERT 실패가 아니다.
 *
 * baseline 패턴: lib/book/reading-session.ts(5중 안전망) + lib/home/actions.ts
 *   (.maybeSingle() + 0행 명시 error로 RLS의 묵묵한 실패 구분). 단 admin client 경로는
 *   RLS를 우회하므로 0행의 의미가 "검증된 id의 부재"로 좁혀진다(소유권은 ③에서 검증).
 *
 * 의도 문서: docs/intent/screen-05-celebrate.md §4.2·§5.5
 * RLS: supabase/migrations/001_initial_schema.sql §9.3(children UPDATE)·§9.6(child_badges)
 */

/** 완독 1회당 적립 포인트 (ADR-0018 D5 매 완독 +50). */
const POINTS_PER_COMPLETION = 50;

/** 완독 배지 코드 (ADR-0018 D6 단일 — milestone 배지는 F22 확장). */
const FIRST_COMPLETION_BADGE = 'first_completion';

/**
 * 결과 — 성공 시 적립 정보(/celebrate 표시용), 실패 시 사용자 메시지 1줄.
 *   - pointsAwarded: 이번 완독 적립량(= POINTS_PER_COMPLETION 상수).
 *   - badgeCode: 부여 시도한 배지 코드.
 *   - badgeNewlyEarned: 이번에 신규 획득(true) vs 이미 보유(false, UNIQUE 충돌 무시).
 */
export type AwardRewardsResult =
  | { ok: true; pointsAwarded: number; badgeCode: string; badgeNewlyEarned: boolean }
  | { ok: false; error: string };

/**
 * 완독 보상을 적립한다(children.points += 50 + child_badges INSERT).
 *
 * 인자 0건(D8) — 내부에서 auth + getActiveChild로 컨텍스트를 재해소한다.
 * completeReadingSession의 1행 UPDATE 성공 직후에만 호출되어야 한다(D3 멱등 앵커).
 */
export async function awardCompletionRewards(): Promise<AwardRewardsResult> {
  // ① 입력 검증 — 인자 0건(D8). zod schema 불요(신뢰 경계는 ②③).

  // ② 인증 가드 — 본인 세션
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.' };
  }

  // ③ child_id 소유권 검증 — getActiveChild(본인 세션·RLS §9.3)로 본인 자녀만 해소
  const child = await getActiveChild(supabase, user.id);

  if (!child) {
    return { ok: false, error: '자녀 정보를 찾을 수 없습니다.' };
  }

  // ④ 보상 쓰기 — createServiceRoleClient(옵션 B). child.id는 ③에서 RLS 검증된 본인 자녀.
  const admin = createServiceRoleClient();

  // ④-1 현재 points 조회 — getActiveChild는 points 미반환. 검증된 child.id로 admin 조회.
  const { data: current, error: selectError } = await admin
    .from('children')
    .select('points')
    .eq('id', child.id)
    .maybeSingle<{ points: number }>();

  if (selectError || !current) {
    return { ok: false, error: '포인트 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }

  // ④-2 points += 50 UPDATE (D5). SELECT-then-UPDATE — 단일 자녀 순차 완독이라 race 무시(베타).
  const { data: updated, error: pointsError } = await admin
    .from('children')
    .update({ points: current.points + POINTS_PER_COMPLETION })
    .eq('id', child.id)
    .select('points')
    .maybeSingle<{ points: number }>();

  if (pointsError || !updated) {
    return { ok: false, error: '포인트 적립에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
  }

  // ④-3 child_badges INSERT (D6). upsert ignoreDuplicates — 재완독 시 UNIQUE 충돌 무시(0행).
  const { data: badge, error: badgeError } = await admin
    .from('child_badges')
    .upsert(
      { child_id: child.id, badge_code: FIRST_COMPLETION_BADGE },
      { onConflict: 'child_id,badge_code', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle<{ id: string }>();

  // 부분 실패(D9 옵션 A): points는 이미 +50됐으나 badge 진짜 에러면 전체 실패 반환
  // (롤백 0건 — 완독·points 보존). UNIQUE 충돌은 ignoreDuplicates로 흡수돼 에러 아님.
  if (badgeError) {
    return { ok: false, error: '배지 부여에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
  }

  // badgeNewlyEarned: 신규 INSERT(badge=객체) vs 기존 보유 충돌무시(badge=null)
  return {
    ok: true,
    pointsAwarded: POINTS_PER_COMPLETION,
    badgeCode: FIRST_COMPLETION_BADGE,
    badgeNewlyEarned: badge !== null,
  };
}
