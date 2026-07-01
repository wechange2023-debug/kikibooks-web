'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { awardCompletionRewards } from '@/lib/book/rewards';
import { getActiveChild } from '@/lib/home/active-child';
import { createClient } from '@/lib/supabase/server';

/**
 * 읽기 세션 server action 2종 — Screen 04 책 뷰어의 완독 흐름(ADR-0017 D5).
 *
 * 자동 페이지 추적을 포기(D3 cross-origin)했으므로, reading_sessions의 두 쓰기는
 * 모두 **명시적 사용자 행동에 1:1 대응**한다:
 *   - startReadingSession  ← 리더 진입(html-reader.tsx useEffect 1회, intent §5.1 L104)
 *   - completeReadingSession ← '다 읽었어요' 클릭(finish-button.tsx, intent §5.3 L131)
 *
 * 시그니처 결정 (결정 #1 재논의 + 사용자 확정 2026-05-27):
 *   두 action 모두 **bookId만** 받는다(sessionId 미전달). intent §5.1·§5.3 박제 정합.
 *   completeReadingSession은 sessionId를 threading하지 않고 server에서 (child_id,
 *   book_id, completed_at IS NULL)로 세션을 재조회한다 — start의 중복 가드 키와 대칭이라
 *   StrictMode 2회·재진입·race가 모두 동일 가드로 흡수된다. FinishButton은 bookId props
 *   1개만 받으므로 sessionId 공유 배선(C1/C2/C3)이 불필요하다.
 *
 * 보안 (Hard Rule 6·9):
 *   - createClient()는 **본인 세션 클라이언트** — secret 키 미사용, 클라이언트 노출 0건.
 *     (보상 적립의 secret 키 쓰기는 awardCompletionRewards에 격리된다 — D4 분리.)
 *   - RLS(001 §9.4)가 1차 방어선, child_id 명시 필터가 2차 방어선:
 *       · "parents can insert own children sessions"
 *           INSERT WITH CHECK (child_id IN (SELECT id FROM children WHERE parent_id = auth.uid()))
 *       · "parents can update own children sessions"
 *           UPDATE USING       (child_id IN (SELECT id FROM children WHERE parent_id = auth.uid()))
 *     다른 사용자의 child_id로는 0행 쓰기가 되며, baseline 패턴대로 0행을 명시 error로 잡는다.
 *
 * baseline 패턴 (lib/home/actions.ts):
 *   - 'use server' 최상단 + zod 입력 검증(입력 신뢰 0)
 *   - .select('id').maybeSingle() 후 **0행이면 명시 error** — RLS의 묵묵한 실패
 *     (0행 + no error)를 사용자에게 보이는 메시지로 구분한다.
 *
 * phase-13 보상 배선 (ADR-0018 D3·D4·D9 — ADR-0017 D7 경계 해소):
 *   phase-12에서 본 모듈은 reading_sessions UPDATE까지만 하고 children.points·
 *   child_badges 쓰기는 0건이었다(ADR-0017 D7 phase-13 경계). phase-13 CP2-c에서
 *   completeReadingSession의 1행 UPDATE 성공 직후(완독 전이 = 멱등 앵커, D3) redirect
 *   직전에 awardCompletionRewards()를 호출해 보상을 적립한다. 본 모듈은 여전히
 *   reading_sessions UPDATE만 **본인 세션**으로 직접 쓰고, children.points +50·
 *   child_badges INSERT는 awardCompletionRewards(secret 키 옵션 B)에 위임한다
 *   (D4 분리 — 클라이언트가 다름). 보상 실패 시 reading_sessions는 롤백하지 않고
 *   (완독 보존, D9 옵션 A) ok:false를 반환해 redirect를 차단한다(FinishButton이 error 노출).
 *
 * 의도 문서: docs/intent/screen-04-reader.md §4.3·§4.4·§5.1·§5.3
 *            docs/intent/screen-05-celebrate.md §4.1·§4.2 (phase-13 보상 배선)
 * RLS: supabase/migrations/001_initial_schema.sql §9.4 (lines 259~273)
 */

/** 입력 신뢰 0 — bookId는 UUID 형식만 허용(가드 1과 동일 형식 검증). */
const bookIdSchema = z.string().uuid({ message: 'bookId 형식이 올바르지 않습니다.' });

/**
 * 결과 — 성공(ok:true) 또는 사용자에게 표시할 에러 메시지 1줄.
 * completeReadingSession은 성공 시 redirect(never)하므로 ok:false만 정상 반환한다.
 */
export type SessionActionResult = { ok: true } | { ok: false; error: string };

/**
 * 리더 진입 시 읽기 세션을 시작한다(html-reader.tsx 마운트 useEffect 1회).
 *
 * 중복 가드 (옵션 Y, ADR-0017 D5·spec d11):
 *   child_id + book_id + completed_at IS NULL 행이 이미 있으면 **재사용**(INSERT 0건),
 *   없을 때만 신규 INSERT. 새로고침·재진입·StrictMode 2회 실행에도 in-progress 세션이
 *   1건으로 유지된다(KPI '완독 세션 100건' 통계 위생 + DB 부하 최소화).
 *   reading_sessions에 unique 제약이 없으므로 애플리케이션 레벨 가드다.
 *
 * 자녀 0명 (intent §4.4): 세션 쓰기를 건너뛰고 ok:true를 반환한다 — 읽기 자체는
 *   가능해야 하므로 실패로 취급하지 않는다. 자녀 0명의 정식 처리는 온보딩 가드(phase-08).
 */
export async function startReadingSession(bookId: string): Promise<SessionActionResult> {
  const parsed = bookIdSchema.safeParse(bookId);
  if (!parsed.success) {
    return { ok: false, error: '잘못된 요청입니다.' };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.' };
  }

  const child = await getActiveChild(supabase, user.id);

  // 자녀 0명 — 세션 미기록(읽기는 가능). intent §4.4.
  if (!child) {
    return { ok: true };
  }

  // 중복 가드 — 미완료 세션이 있으면 재사용(INSERT 0건).
  const { data: existing, error: selectError } = await supabase
    .from('reading_sessions')
    .select('id')
    .eq('child_id', child.id)
    .eq('book_id', parsed.data)
    .is('completed_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (selectError) {
    return { ok: false, error: '세션을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }

  if (existing) {
    return { ok: true };
  }

  // 미완료 세션 없음 — 신규 INSERT(started_at·pages_read·is_completed DEFAULT).
  const { error: insertError } = await supabase
    .from('reading_sessions')
    .insert({ child_id: child.id, book_id: parsed.data })
    .select('id')
    .single<{ id: string }>();

  if (insertError) {
    return { ok: false, error: '세션을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }

  return { ok: true };
}

/**
 * '다 읽었어요' 클릭 시 완독 처리 + 보상 적립 후 /celebrate로 이동한다(finish-button.tsx).
 *
 * 동작:
 *   1. getActiveChild로 child_id 해소(없으면 명시 error).
 *   2. 미완료 세션을 completed_at=NOW()·is_completed=true로 UPDATE
 *      (WHERE child_id + book_id + completed_at IS NULL — start의 가드 키와 대칭).
 *   3. .select('id').maybeSingle() 후 0행이면 명시 error(이미 완독했거나 세션 없음).
 *   4. 1행 UPDATE 성공(완독 전이 = 멱등 앵커, ADR-0018 D3) → awardCompletionRewards()로
 *      보상 적립(children.points +50 + child_badges INSERT, secret 키 옵션 B, D4 분리).
 *      보상 실패 시 ok:false 반환(완독은 보존, redirect 차단, D9 옵션 A).
 *   5. 보상 성공 시 redirect(`/book/${bookId}/celebrate`).
 *
 * pages_read는 건드리지 않는다(DEFAULT 0 유지, ADR-0017 D3). children.points·
 * child_badges 직접 쓰기는 0건 — awardCompletionRewards(secret 키)에 위임한다(D4).
 *
 * 통신 계약 (phase-12 보존 — FinishButton 무변경):
 *   성공 시 redirect(never), 실패(완독 실패·보상 실패)에만 { ok:false, error } 반환.
 *   FinishButton은 반환값이 오면 곧 실패로 처리(setError)하므로 변경이 0건이다.
 */
export async function completeReadingSession(
  bookId: string,
): Promise<{ ok: false; error: string }> {
  const parsed = bookIdSchema.safeParse(bookId);
  if (!parsed.success) {
    return { ok: false, error: '잘못된 요청입니다.' };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.' };
  }

  const child = await getActiveChild(supabase, user.id);

  if (!child) {
    return { ok: false, error: '자녀 정보를 찾을 수 없습니다.' };
  }

  // completed_at은 앱 서버 시각(ISO) — Supabase-JS의 NOW() 등가. WHERE의 IS NULL이
  // 미완료 세션만 좁혀, 이미 완독한 세션의 재완독(중복 UPDATE)을 막는다.
  const { data, error } = await supabase
    .from('reading_sessions')
    .update({ completed_at: new Date().toISOString(), is_completed: true })
    .eq('child_id', child.id)
    .eq('book_id', parsed.data)
    .is('completed_at', null)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error) {
    return { ok: false, error: '완독 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
  }

  // 0행 — 미완료 세션 없음(세션 미시작·이미 완독) 또는 RLS 차단(다른 사용자 자녀).
  if (!data) {
    return { ok: false, error: '완독할 세션을 찾을 수 없습니다.' };
  }

  // 보상 적립 (ADR-0018 D3·D4·D9 + Amendment #1): 1행 UPDATE 성공 = in-progress → completed
  // 전이 = 멱등 앵커. redirect 직전에 awardCompletionRewards(secret 키 옵션 B)로 children.points
  // +50 + child_badges INSERT를 적립한다(D4 분리 — 본 함수는 본인 세션). 위 :168에서 RLS로
  // 검증한 child.id를 인자로 넘긴다(Amendment #1 — awardCompletionRewards의 auth·getActiveChild
  // 재해소 중복 제거). 보상 실패 시
  // reading_sessions UPDATE는 롤백하지 않고(완독 보존, D9 옵션 A) ok:false를 반환해
  // redirect를 차단한다 — FinishButton이 error를 노출한다(통신 계약 보존).
  //
  // ★ redirect()는 NEXT_REDIRECT를 throw하므로 반드시 try-catch '밖'에 둔다 — 보상만
  //   try로 감싸 redirect의 정상 흐름 throw가 catch에 오포착되는 것을 막는다.
  try {
    const reward = await awardCompletionRewards(child.id);
    if (!reward.ok) {
      return { ok: false, error: reward.error };
    }
    // 성공 결과(pointsAwarded·badgeCode·badgeNewlyEarned)는 여기서 무시한다 —
    // /celebrate 페이지가 children.points·child_badges를 직접 조회해 표시한다(CP2-e).
  } catch {
    // awardCompletionRewards는 모든 분기에서 ok:false를 반환하므로 정상적으로 throw하지
    // 않는다 — createServiceRoleClient의 env 누락 등 예외만 방어한다.
    return { ok: false, error: '보상 적립 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' };
  }

  // 성공 — celebrate로 이동(redirect는 never 반환, 이후 코드 도달 불가).
  redirect(`/book/${parsed.data}/celebrate`);
}
