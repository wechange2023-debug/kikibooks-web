import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 활성 자녀 결정 헬퍼 — 홈 화면의 모든 데이터가 "지금 보고 있는 자녀 1명"을 기준으로
 * 계산된다(인사 카드·추천·스트릭). 본 모듈은 그 1명을 결정하는 단일 진입점이다.
 *
 * 베타 정책 (cp2_decisions d6):
 *   - 첫 번째 자녀 = children.created_at ASC LIMIT 1
 *   - 다자녀 모드(사용자가 자녀를 토글하여 전환)는 phase-13 이후 본 파일만 수정으로 확장
 *
 * RLS 근거:
 *   - 001 §9.3 "parents can view own children" (parent_id = auth.uid())
 *   - 사용자 본인 세션 클라이언트로 호출되므로 본인 자녀만 가시
 *   - .eq('parent_id', parentId)는 명시 필터로 RLS의 2차 방어선 역할
 *
 * 사용자 흐름: docs/intent/screen-02-home.md §3·§4.2(자녀 0명 → /onboarding 가드)
 */

/** 홈 화면이 의존하는 자녀 데이터 — 인사·추천·스트릭에 필요한 최소 컬럼만. */
export interface ActiveChild {
  id: string;
  name: string;
  current_level: number;
  age: number | null;
}

/** children 테이블 조회 행. */
interface ChildRow {
  id: string;
  name: string;
  current_level: number;
  age: number | null;
}

/**
 * 학부모의 첫 번째 자녀를 반환한다(created_at ASC LIMIT 1). 자녀가 없으면 null.
 *
 * 자녀 0명일 때의 처리는 호출자(`/home` 페이지)가 책임진다 —
 * intent §3·§4.2에 따라 페이지 컴포넌트 안에서 redirect('/onboarding')로 분기한다.
 * 본 함수는 null을 반환할 뿐 자체적으로 리다이렉트를 트리거하지 않는다.
 *
 * @param supabase 호출자가 만든 본인 세션 Supabase 클라이언트.
 * @param parentId 본인 user.id (auth.getUser()로 확인된 값).
 */
export async function getActiveChild(
  supabase: SupabaseClient,
  parentId: string,
): Promise<ActiveChild | null> {
  const { data, error } = await supabase
    .from('children')
    .select('id, name, current_level, age')
    .eq('parent_id', parentId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<ChildRow>();

  if (error) {
    throw new Error(`getActiveChild: children 조회 실패 — ${error.message}`);
  }

  return data ?? null;
}
