import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 로그인한 학부모에게 등록된 자녀(children 행)가 하나라도 있는지 확인한다.
 *
 * - children COUNT 쿼리 1회. head:true라 행 본문은 가져오지 않는다.
 * - 사용자 본인 세션 클라이언트로 호출되므로 001 스키마의 RLS 정책
 *   "parents can view own children"(parent_id = auth.uid())에 의해 본인 자녀만
 *   카운트된다. .eq('parent_id', parentId)는 그 의도를 코드에도 드러내는
 *   명시적 필터다 — RLS가 1차 방어선, 명시 필터가 2차.
 * - 로그인 도착 분기(resolvePostLoginPath)와 /onboarding 페이지 역가드가 쓴다.
 *
 * 사용자 흐름: docs/intent/onboarding-flow.md 4.1·4.2절
 */
export async function hasChildren(
  supabase: SupabaseClient,
  parentId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from('children')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', parentId);

  if (error) {
    throw new Error(`hasChildren: children 조회 실패 — ${error.message}`);
  }

  return (count ?? 0) > 0;
}
