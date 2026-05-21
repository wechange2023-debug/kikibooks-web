import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { BOOK_DASH_404_SOURCE_IDS } from '@/lib/landing/popular-books';
import type { PopularBook } from '@/lib/landing/popular-books';

/**
 * 오늘의 추천 5권 — 자녀의 current_level을 기준으로 미독 책을 무작위로 고른다.
 *
 * d5 폴백 사다리 (cp1_decisions, intent §5.2):
 *   단계 1: level ±1 + 미독 책 ≥ count → 5권 (기본)
 *   단계 2: level ±1 부족 → ±2로 확장
 *   단계 3: ±2 부족 → ±3으로 확장
 *   단계 4: ±3에서도 부족 → 나온 N권만 (1 ≤ N < count)
 *   단계 5: ±3에서도 0권 → 빈 상태
 *
 * 각 단계는 별도 쿼리·명시 분기로 구현하여 코드만 보고 사다리 단계를 식별할 수 있다
 * (CP2-b batch2 자체 점검 (a)).
 *
 * 정렬: Supabase JS는 ORDER BY random() 미지원이므로 JS 부분 셔플로 무작위화한다
 * (lib/landing/popular-books.ts 패턴 재사용, ADR-0012 결정 3 정합).
 *
 * 적용 필터:
 *   - is_active = true
 *   - level BETWEEN min AND max (단계별 범위)
 *   - source_id NOT IN BOOK_DASH_404_SOURCE_IDS (ADR-0014 결정 2, 옵션 A 재사용)
 *   - id NOT IN reading_sessions WHERE child_id = … AND is_completed = true (미독)
 *   - source_platform 필터 없음 (옵션 Y 환원, ADR-0014 결정 4)
 *
 * RLS 근거:
 *   - books: §9.1 USING(true) 공개 SELECT
 *   - reading_sessions: §9.4 "parents can view own children sessions"
 *   .eq('child_id', child.id)는 명시 필터로 RLS의 2차 방어선
 *
 * 의도 문서: docs/intent/screen-02-home.md §5.2
 */

/** 자녀의 현재 레벨 기준으로 추천을 만들기 위해 필요한 최소 정보. */
export interface RecommendationChild {
  id: string;
  current_level: number;
}

/** 폴백 사다리 단계 (1~5). 호출자가 표시 메시지·로깅에 사용한다. */
export type RecommendationFallbackStage = 1 | 2 | 3 | 4 | 5;

/** 추천 결과 — books는 길이 0~count, fallbackStage는 어느 단계에서 결과를 얻었는지. */
export interface RecommendationResult {
  books: PopularBook[];
  fallbackStage: RecommendationFallbackStage;
}

/** books 테이블 id 조회 행 (1차 필터링용). */
interface BookIdRow {
  id: string;
}

/** books 테이블 표지 카드 조회 행 (2차 상세 조회용). */
interface BookCardRow {
  id: string;
  title: string;
  author: string | null;
  cover_url: string;
}

/** reading_sessions 완독 행 조회용. */
interface CompletedSessionRow {
  book_id: string;
}

/** 기본 추천 권수 (PLAN.md 9절). */
export const RECOMMENDATIONS_COUNT = 5;

/**
 * 자녀의 완독한 book_id 목록을 Set으로 반환한다. 차집합 계산에 사용한다.
 */
async function fetchCompletedBookIds(
  supabase: SupabaseClient,
  childId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('reading_sessions')
    .select('book_id')
    .eq('child_id', childId)
    .eq('is_completed', true)
    .returns<CompletedSessionRow[]>();

  if (error) {
    throw new Error(
      `fetchCompletedBookIds: reading_sessions 조회 실패 — ${error.message}`,
    );
  }
  return new Set((data ?? []).map((row) => row.book_id));
}

/**
 * 주어진 level 범위에서 미독·블랙리스트 외 활성 책 id를 모두 가져와 무작위 count권 선택한다.
 * 결과가 부족하면 가능한 만큼만 반환한다(폴백 사다리 상위 단계가 다시 호출).
 */
async function pickBooksAtLevelRange(
  supabase: SupabaseClient,
  minLevel: number,
  maxLevel: number,
  completedIds: Set<string>,
  count: number,
): Promise<PopularBook[]> {
  let idQuery = supabase
    .from('books')
    .select('id')
    .eq('is_active', true)
    .gte('level', minLevel)
    .lte('level', maxLevel);

  for (const blockedSourceId of BOOK_DASH_404_SOURCE_IDS) {
    idQuery = idQuery.neq('source_id', blockedSourceId);
  }

  const { data: idRows, error: idError } = await idQuery.returns<BookIdRow[]>();
  if (idError) {
    throw new Error(`pickBooksAtLevelRange: id 조회 실패 — ${idError.message}`);
  }

  const candidates = (idRows ?? [])
    .map((row) => row.id)
    .filter((id) => !completedIds.has(id));

  if (candidates.length === 0) {
    return [];
  }

  const picked = pickRandom(candidates, count);

  const { data: bookRows, error: bookError } = await supabase
    .from('books')
    .select('id, title, author, cover_url')
    .in('id', picked)
    .returns<BookCardRow[]>();

  if (bookError) {
    throw new Error(`pickBooksAtLevelRange: 책 상세 조회 실패 — ${bookError.message}`);
  }

  return (bookRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    author: row.author,
    coverUrl: row.cover_url,
  }));
}

/**
 * 자녀에게 추천할 책 count권과 폴백 사다리의 도달 단계를 함께 반환한다.
 */
export async function getRecommendations(
  supabase: SupabaseClient,
  child: RecommendationChild,
  count: number = RECOMMENDATIONS_COUNT,
): Promise<RecommendationResult> {
  const completedIds = await fetchCompletedBookIds(supabase, child.id);
  const baseLevel = child.current_level;

  // 단계 1: ±1
  const stage1 = await pickBooksAtLevelRange(
    supabase,
    baseLevel - 1,
    baseLevel + 1,
    completedIds,
    count,
  );
  if (stage1.length >= count) {
    return { books: stage1, fallbackStage: 1 };
  }

  // 단계 2: ±2
  const stage2 = await pickBooksAtLevelRange(
    supabase,
    baseLevel - 2,
    baseLevel + 2,
    completedIds,
    count,
  );
  if (stage2.length >= count) {
    return { books: stage2, fallbackStage: 2 };
  }

  // 단계 3: ±3
  const stage3 = await pickBooksAtLevelRange(
    supabase,
    baseLevel - 3,
    baseLevel + 3,
    completedIds,
    count,
  );
  if (stage3.length >= count) {
    return { books: stage3, fallbackStage: 3 };
  }

  // 단계 4: ±3에서도 부족 → 나온 N권만 (N ≥ 1)
  if (stage3.length > 0) {
    return { books: stage3, fallbackStage: 4 };
  }

  // 단계 5: ±3에서도 0권 → 빈 상태
  return { books: [], fallbackStage: 5 };
}

/**
 * Fisher-Yates 부분 셔플 — 원본을 변경하지 않고 무작위 count개를 고른다.
 * count가 items 길이보다 크면 items 전체를 무작위 순서로 반환한다.
 * (lib/landing/popular-books.ts pickRandom과 동일 구현 — phase-13b에서 lib/shared로 통합 가능)
 */
function pickRandom<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  const limit = Math.min(Math.max(count, 0), pool.length);
  for (let i = 0; i < limit; i += 1) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, limit);
}
