'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { assertAdmin } from '@/lib/admin/gate';
import {
  AdminBookFiltersSchema,
  getAdminBooks,
  type AdminBooksPage,
} from '@/lib/admin/books/query';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * /admin/books 큐레이션 server action — phase-13b CP3-a 신규.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용 (CP1-adr ADR-0019)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - D2 트리플 가드 4단 표준 — ①zod ②auth.getUser ③requireAdmin ④createServiceRoleClient.
 *     본 모듈은 ②+③단을 assertAdmin()(gate.ts)으로 통합한다(server action 환경 정합 —
 *     redirect 대신 ok/error 반환). 실효 패턴 = ①zod → ②+③assertAdmin → ④service role UPDATE.
 *   - D11 revalidatePath 3중 호출 — mutation 직후 '/admin/books' + '/home' + '/library'.
 *     force-dynamic 페이지에서 효과는 미세하나 표준 박제(향후 ISR·캐시 도입 시 자동 동기).
 *   - D18 낙관적 UI — server action 결과는 클라이언트가 useTransition으로 받아 즉시 시각
 *     토글 환원 또는 메시지 표시. 본 server action은 결과만 반환(클라이언트 책임).
 *   - Hard Rule 1 — books UPDATE 컬럼은 `is_active`·`level` **두 컬럼만**. attribution_text·
 *     license·source_platform·source_id·title·content_url 등 라이선스/식별 핵심 컬럼
 *     UPDATE 0건. enforce_commercial_license 트리거(BEFORE UPDATE)는 NEW.license =
 *     OLD.license(미수정)라 통과 정합. 책 INSERT/DELETE 0건.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 가드 순서 (D2 4단)
 * ──────────────────────────────────────────────────────────────────────────────
 *   ① zod safeParse — 잘못된 bookId·level 차단(공격 표면 축소)
 *   ②+③ assertAdmin — auth.getUser + profiles.role IN ('admin','curator')
 *     · 미인증/비admin은 { ok: false, error } 반환 → 그대로 server action 반환
 *     · 통과 시 { ok: true, ctx }
 *   ④ createServiceRoleClient + books.update — RLS 우회는 이 문장에만 국한
 *     · .select('id').maybeSingle()로 affected_rows 검증(0행 = 존재하지 않는 bookId)
 *
 * revalidatePath 3중 호출은 mutation 성공(✓ affected_rows ≥ 1) 후에만.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 자진 신고 — 박제 약화 1건 (phase-13c follow-up 후보)
 * ──────────────────────────────────────────────────────────────────────────────
 *   에러 메시지 한국어 하드코딩 — AdminCopy.errors가 Record<string, never>로 박제
 *   (CP2-a 박제 메시지 0건)이라 본 모듈의 사용자 표시 메시지는 임시 하드코딩이다.
 *   updateChildLevel(lib/home/actions.ts)·fetchLibraryPage(lib/library/actions.ts) 동형
 *   하드코딩 패턴 정합. phase-13c follow-up으로 박제 확장 시 copy.errors로 이동.
 *
 * 의도 문서: docs/intent/admin-system.md §4.2·§5.7
 * ADR: docs/adr/0019-admin-system.md D2·D5·D11·D18
 * 패턴 정합: lib/home/actions.ts updateChildLevel(zod·auth·UPDATE·affected_rows·revalidatePath·
 *           ok/error 반환), lib/library/actions.ts fetchLibraryPage(unknown 입력·zod·try-catch)
 */

// =============================================================================
// Schemas — books.level CHECK(1~5)·is_active BOOLEAN 정합 (001 line 80·99)
// =============================================================================

const toggleBookActiveSchema = z.object({
  bookId: z.string().uuid({ message: 'bookId 형식이 올바르지 않습니다.' }),
  nextValue: z.boolean(),
});

const updateBookLevelSchema = z.object({
  bookId: z.string().uuid({ message: 'bookId 형식이 올바르지 않습니다.' }),
  /**
   * books.level CHECK(level BETWEEN 1 AND 5) + nullable(001 line 80) 정합.
   * intent §4.2 박제 "z.number().int().min(1).max(5).nullable()" 직역.
   */
  level: z.number().int().min(1).max(5).nullable(),
});

// =============================================================================
// Result types — lib/home/actions.ts UpdateChildLevelResult 패턴 정합
// =============================================================================

export type MutationResult = { ok: true } | { ok: false; error: string };

export type FetchAdminBooksPageResult =
  | { ok: true; page: AdminBooksPage }
  | { ok: false; error: string };

// =============================================================================
// D11 revalidatePath 3중 호출 — mutation 성공 시 admin/books + home + library
// =============================================================================

const ADMIN_MUTATION_REVALIDATE_PATHS = [
  '/admin/books',
  '/home',
  '/library',
] as const;

function revalidateAdminMutationTargets(): void {
  for (const path of ADMIN_MUTATION_REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

// =============================================================================
// toggleBookActive — is_active 토글 (intent §4.2 박제 직역)
// =============================================================================

/**
 * 책의 공개/비공개 상태를 토글한다.
 *
 * @param input { bookId: UUID, nextValue: boolean } — 외부 신뢰 0(unknown 받음)
 * @returns { ok: true } 또는 { ok: false, error: string }
 *
 * UPDATE 컬럼: is_active 단일. license/attribution_text 등 미포함 → 트리거 통과.
 */
export async function toggleBookActive(input: unknown): Promise<MutationResult> {
  // ① zod
  const parsed = toggleBookActiveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: '입력값을 다시 확인해 주세요.' };
  }

  // ②+③ assertAdmin (auth + role IN admin·curator)
  const adminCheck = await assertAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  // ④ service role UPDATE — RLS 우회는 이 문장에만 국한
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from('books')
    .update({ is_active: parsed.data.nextValue })
    .eq('id', parsed.data.bookId)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error) {
    return { ok: false, error: '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
  }
  if (!data) {
    return { ok: false, error: '책을 찾을 수 없습니다.' };
  }

  // D11 — 3중 revalidatePath
  revalidateAdminMutationTargets();

  return { ok: true };
}

// =============================================================================
// updateBookLevel — level 1~5 또는 NULL (intent §4.2 박제 직역)
// =============================================================================

/**
 * 책의 레벨을 변경한다(1~5 또는 NULL).
 *
 * @param input { bookId: UUID, level: 1~5 | null } — 외부 신뢰 0(unknown 받음)
 * @returns { ok: true } 또는 { ok: false, error: string }
 *
 * UPDATE 컬럼: level 단일. CHECK(level BETWEEN 1 AND 5)는 nullable 정합이라 NULL UPDATE
 * 가능. license/attribution_text 등 미포함 → 트리거 통과.
 */
export async function updateBookLevel(input: unknown): Promise<MutationResult> {
  // ① zod
  const parsed = updateBookLevelSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: '레벨 값을 다시 확인해 주세요.' };
  }

  // ②+③ assertAdmin
  const adminCheck = await assertAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  // ④ service role UPDATE
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from('books')
    .update({ level: parsed.data.level })
    .eq('id', parsed.data.bookId)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error) {
    return { ok: false, error: '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
  }
  if (!data) {
    return { ok: false, error: '책을 찾을 수 없습니다.' };
  }

  // D11 — 3중 revalidatePath
  revalidateAdminMutationTargets();

  return { ok: true };
}

// =============================================================================
// fetchAdminBooksPage — 필터 변경·무한 스크롤 페이지 fetch (intent §4.2 박제 직역)
// =============================================================================

/**
 * /admin/books 책 목록 1페이지를 가져온다 — AdminBooksBrowser(CP3-b 예정)가 필터 변경·
 * 무한 스크롤마다 호출.
 *
 * @param filtersInput unknown — AdminBookFiltersSchema로 검증
 * @param cursor 다음 페이지 opaque cursor (null이면 첫 페이지)
 *
 * 가드 3단:
 *   ① zod AdminBookFiltersSchema.safeParse
 *   ②+③ assertAdmin
 *   getAdminBooks 호출(query.ts 내부 createServiceRoleClient + SELECT)
 *
 * UPDATE 0건이라 revalidatePath 호출 0건. fetchLibraryPage(lib/library/actions.ts)
 * 정합 패턴.
 */
export async function fetchAdminBooksPage(
  filtersInput: unknown,
  cursor: string | null,
): Promise<FetchAdminBooksPageResult> {
  // ① zod
  const parsed = AdminBookFiltersSchema.safeParse(filtersInput);
  if (!parsed.success) {
    return { ok: false, error: '필터 입력이 올바르지 않습니다.' };
  }

  // ②+③ assertAdmin
  const adminCheck = await assertAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  // SELECT (getAdminBooks 내부 createServiceRoleClient)
  try {
    const page = await getAdminBooks(parsed.data, cursor);
    return { ok: true, page };
  } catch {
    return { ok: false, error: '책을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }
}
