import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * 완독 보상 내부 함수 — Screen 05 완독 흐름의 보상 적립(ADR-0018 D1~D9 + Amendment #1).
 *
 * completeReadingSession(lib/book/reading-session.ts)이 reading_sessions의 1행 UPDATE
 * 성공 직후(완독 전이 = 멱등 앵커, D3) redirect 직전에 본 함수를 호출한다. 클라이언트
 * (FinishButton)는 본 함수를 직접 호출하지 않으며 보상의 존재를 모른다(D4 분리).
 *
 * ★ ADR-0018 Amendment #1 (2026-07-01): 본 함수는 더 이상 'use server' server action이
 *   아니라 **server-only 내부 함수**다(파일 상단 import 'server-only'). 클라이언트가 직접 호출
 *   가능한 표면이 없으므로, 유일 호출자 completeReadingSession이 RLS로 검증한 childId를 인자로
 *   받아 auth·getActiveChild 재해소(순차 2왕복)를 제거한다. 자세한 결정·안전 논거는
 *   docs/adr/0018-completion-rewards-and-library.md Amendment #1 참조.
 *
 * 옵션 B (D1 — child_badges INSERT는 시스템이 책임):
 *   001 §9.6은 child_badges에 SELECT 정책만 두고 "INSERT는 시스템이 책임"으로 박제한다
 *   (line 293). 본인 세션 INSERT는 RLS가 거부하므로 createServiceRoleClient(secret 키,
 *   RLS 우회)로 쓴다. Hard Rule 6 — secret 키는 본 server-only 함수 내부에서만 쓰이고,
 *   lib/supabase/server.ts가 import 'server-only'로 클라이언트 번들 포함 시 빌드를
 *   실패시킨다. ADR-0003 §2 '서버 전용. cron·시드·관리자 라우트' 정합.
 *
 * 안전망 (Amendment #1 재구성 — secret 키 쓰기의 자녀 격리):
 *   ① server action 표면 제거 — 'use server' 미부여. 클라이언트 직접 호출 경로가 구조적으로
 *      없다(D8이 방어하던 "외부 조작 childId 직접 호출" 위협이 원천 소멸).
 *   ② childId 신뢰 계약 — 유일 호출자 completeReadingSession이 getActiveChild(본인 세션·RLS
 *      §9.3 parent_id=auth.uid())로 이미 검증한 본인 자녀 id만 넘긴다. secret 키 쓰기가 받는
 *      childId는 "본인 자녀임이 보증된" 값이다.
 *   ③ createServiceRoleClient 쓰기 — 검증된 childId로만 children.points UPDATE + child_badges
 *      INSERT. RLS 우회는 이 쓰기 문장에만 국한된다. childId 소유권은 호출자(②)가 책임진다.
 *
 * 시그니처 (Amendment #1 — childId 1개):
 *   호출자가 RLS 검증한 childId를 받는다. 내부 auth·getActiveChild 재해소 0건. 반환은
 *   /celebrate 표시용(pointsAwarded·badgeCode·badgeNewlyEarned, CP2-e 활용).
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
 * @param childId 호출자(completeReadingSession)가 getActiveChild로 RLS 검증한 본인 자녀 id
 *   (ADR-0018 Amendment #1). 본 함수는 server-only 내부 함수라 클라이언트 직접 호출 표면이
 *   없으므로, 외부 조작 id 유입 경로가 구조적으로 차단된다. completeReadingSession의 1행
 *   UPDATE 성공 직후에만 호출되어야 한다(D3 멱등 앵커).
 */
export async function awardCompletionRewards(
  childId: string,
): Promise<AwardRewardsResult> {
  // ★ ADR-0018 Amendment #1: 본 함수는 'use server' server action이 아니라 server-only
  //   내부 함수다(클라이언트 직접 호출 표면 없음). childId는 유일 호출자 completeReadingSession이
  //   getActiveChild(본인 세션·RLS §9.3 parent_id=auth.uid())로 이미 검증한 본인 자녀 id다.
  //   따라서 secret 키(RLS 우회) 쓰기가 남의 자녀를 건드릴 수 없다 — auth·소유권 재해소를
  //   제거해도 안전(외부 조작 id 유입 경로가 구조적으로 없음). 재해소 중복(auth 1왕복 +
  //   getActiveChild 1왕복)이 제거된다.

  // ④ 보상 쓰기 — createServiceRoleClient(옵션 B). childId는 호출자가 RLS 검증한 본인 자녀.
  const admin = createServiceRoleClient();

  // ④-1 현재 points 조회 — 검증된 childId로 admin 조회(getActiveChild는 points 미반환).
  const { data: current, error: selectError } = await admin
    .from('children')
    .select('points')
    .eq('id', childId)
    .maybeSingle<{ points: number }>();

  if (selectError || !current) {
    return { ok: false, error: '포인트 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }

  // ④-2 points += 50 UPDATE (D5). SELECT-then-UPDATE — 단일 자녀 순차 완독이라 race 무시(베타).
  const { data: updated, error: pointsError } = await admin
    .from('children')
    .update({ points: current.points + POINTS_PER_COMPLETION })
    .eq('id', childId)
    .select('points')
    .maybeSingle<{ points: number }>();

  if (pointsError || !updated) {
    return { ok: false, error: '포인트 적립에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
  }

  // ④-3 child_badges INSERT (D6). upsert ignoreDuplicates — 재완독 시 UNIQUE 충돌 무시(0행).
  const { data: badge, error: badgeError } = await admin
    .from('child_badges')
    .upsert(
      { child_id: childId, badge_code: FIRST_COMPLETION_BADGE },
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
