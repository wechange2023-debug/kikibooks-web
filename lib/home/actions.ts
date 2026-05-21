'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

/**
 * 자녀 레벨 변경 server action — 홈의 LevelSelector가 호출한다.
 *
 * 정책 (cp1_decisions d2 + CP2-a batch2 자체 점검 (c)):
 *   - 'use server' 파일 최상단 (Next.js server action 규약)
 *   - zod로 childId·newLevel 검증 (입력 신뢰 0)
 *   - createClient()는 본인 세션 클라이언트 — RLS §9.3 "parents can update own children"
 *     (parent_id = auth.uid())가 1차 방어선. 다른 사용자의 childId 입력 시 0행 UPDATE.
 *   - `.update(...).eq('id', childId).select('id').maybeSingle()`로 affected_rows 검증.
 *     **0행이면 명시적 error 반환** — RLS의 묵묵한 실패(UPDATE 0행 + no error)를 방지.
 *   - 성공 시 revalidatePath('/home')로 추천 5권을 새 레벨 기준으로 재계산.
 *
 * single() vs maybeSingle():
 *   - .single()은 0행이면 PostgrestError(code='PGRST116')를 던져 일반 error 분기로 흡수됨.
 *   - .maybeSingle()은 0행이면 data=null + error=null. 0행과 다른 에러를
 *     **구분된 에러 메시지로 표시**할 수 있어 채택.
 *
 * 의도 문서: docs/intent/screen-02-home.md §5.4
 * RLS: supabase/migrations/001_initial_schema.sql §9.3
 */

const updateChildLevelSchema = z.object({
  childId: z.string().uuid({ message: 'childId 형식이 올바르지 않습니다.' }),
  newLevel: z
    .number()
    .int()
    .min(1, '레벨은 1 이상이어야 합니다.')
    .max(5, '레벨은 5 이하여야 합니다.'),
});

export type UpdateChildLevelInput = z.infer<typeof updateChildLevelSchema>;

/**
 * 결과 — 성공 또는 사용자에게 표시할 에러 메시지 1줄.
 * 호출자(LevelSelector 클라이언트 컴포넌트)는 ok=false 시 사용자에게 메시지를 보여주고
 * 옵티미스틱 UI를 되돌린다.
 */
export type UpdateChildLevelResult = { ok: true } | { ok: false; error: string };

export async function updateChildLevel(
  input: UpdateChildLevelInput,
): Promise<UpdateChildLevelResult> {
  const parsed = updateChildLevelSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: '입력값을 다시 확인해 주세요.' };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.' };
  }

  const { data, error } = await supabase
    .from('children')
    .update({ current_level: parsed.data.newLevel })
    .eq('id', parsed.data.childId)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error) {
    return {
      ok: false,
      error: '레벨 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }

  // 0행 — RLS 차단(다른 사용자의 childId) 또는 존재하지 않는 childId.
  if (!data) {
    return { ok: false, error: '자녀 정보를 찾을 수 없습니다.' };
  }

  // 추천 5권 재계산 — 새 current_level 기준으로 /home 캐시 무효화.
  revalidatePath('/home');

  return { ok: true };
}
