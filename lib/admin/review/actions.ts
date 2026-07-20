'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { assertAdmin } from '@/lib/admin/gate';
import type { ReviewStatus } from '@/lib/admin/review/query';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * /admin/review 검수 server action (ADR-0051 구현 2 신규).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용
 * ──────────────────────────────────────────────────────────────────────────────
 *   - ADR-0051 D2: 편집 대상은 book_text.text 단일. blocks(jsonb) UPDATE 0건(2차 백로그).
 *   - ADR-0051 D3: text 저장은 in_review 상태에서만 가능. 전이는 4상태 규칙표대로만 허용.
 *     tts_done 설정은 본 모듈이 하지 않는다 — TTS 파이프라인 소관(박제 직역).
 *   - ADR-0051 D5: 각 action은 layout 가드에 의존하지 않고 트리플 가드를 자체 적용한다.
 *     server action 표면은 클라이언트가 직접 호출 가능하므로 layout 가드 밖이다.
 *   - ADR-0019 D2: 실효 패턴 = ①zod → ②+③assertAdmin → ④service role UPDATE.
 *   - ADR-0019 D18: 결과는 { ok } / { ok:false, error } 반환. throw로 흐름 제어 0건 —
 *     클라이언트가 useTransition으로 받아 메시지를 표시한다(books/actions.ts 정합).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 서버 측 상태 검증이 필수인 이유 (클라이언트 잠금 불신)
 * ──────────────────────────────────────────────────────────────────────────────
 *   화면이 편집칸을 잠그는 것은 UX일 뿐 보안 경계가 아니다. server action은 URL만 알면
 *   직접 호출 가능하므로, 두 action 모두 DB의 현재 status를 다시 읽어 판정한다:
 *     - saveReviewText: 현재 status가 'in_review'가 아니면 거부
 *     - transitionReviewStatus: 현재 status → 요청 status가 허용 전이표에 없으면 거부
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Hard Rule 무저촉
 * ──────────────────────────────────────────────────────────────────────────────
 *   - books 테이블 UPDATE 0건 → attribution_text(Hard Rule 1)·license(Hard Rule 2
 *     enforce_commercial_license 트리거) 무관. 본 모듈은 book_text·book_review만 쓴다.
 *   - Hard Rule 6: service role은 ④단(가드 통과 후)에만 사용. 클라이언트 노출 0건.
 *
 * updated_at:
 *   book_text·book_review 모두 BEFORE UPDATE 트리거(touch_updated_at, migration 006 §2.5)가
 *   자동 갱신한다 → 본 모듈은 updated_at을 명시 SET 하지 않는다(이중 관리 방지).
 *
 * ADR: docs/adr/0051-admin-review-screen.md D2·D3·D5
 * 패턴 정합: lib/admin/books/actions.ts (zod 스키마 → assertAdmin → service role → revalidate)
 */

// =============================================================================
// zod 스키마 — 외부 신뢰 0(unknown 받음)
// =============================================================================

const saveReviewTextSchema = z.object({
  bookId: z.string().uuid({ message: 'bookId 형식이 올바르지 않습니다.' }),
  /** book_text.page_index CHECK(page_index >= 0) 정합. 0-based(ADR-0046 D2). */
  pageIndex: z.number().int().min(0),
  /**
   * 빈 문자열 허용 — 간판·장식만 있던 페이지는 낭독본이 0자가 될 수 있다
   * (ADR-0048 DECOR 제외 결과). book_text.text는 NOT NULL DEFAULT ''라 정합.
   */
  text: z.string(),
});

const transitionReviewStatusSchema = z.object({
  bookId: z.string().uuid({ message: 'bookId 형식이 올바르지 않습니다.' }),
  /**
   * 도착 상태는 in_review·confirmed 2종만. draft 회귀는 없고(초안은 적재 시점의 상태),
   * tts_done은 TTS 파이프라인 소관이라 화면발 설정을 타입 단계에서 차단한다(ADR-0051 D3).
   */
  to: z.enum(['in_review', 'confirmed']),
});

// =============================================================================
// 결과 타입 — lib/admin/books/actions.ts MutationResult 정합
// =============================================================================

export type ReviewMutationResult = { ok: true } | { ok: false; error: string };

// =============================================================================
// 허용 전이표 (ADR-0051 D3 박제 직역)
// =============================================================================

/**
 *   draft      → in_review   (검수시작)
 *   in_review  → confirmed   (확정)
 *   confirmed  → in_review   (되돌리기)
 *   tts_done   → in_review   (되돌리기 — 경고 팝업은 클라이언트 몫, 서버는 전이 자체를 허용)
 *
 * 표에 없는 전이(예: draft → confirmed, confirmed → confirmed, 어떤 상태 → tts_done)는
 * 전부 거부된다. 같은 상태로의 자기 전이도 표에 없으므로 거부 — 중복 클릭이 reviewed_at을
 * 덮어쓰지 않게 한다.
 */
const ALLOWED_TRANSITIONS: Record<ReviewStatus, readonly ReviewStatus[]> = {
  draft: ['in_review'],
  in_review: ['confirmed'],
  confirmed: ['in_review'],
  tts_done: ['in_review'],
};

// =============================================================================
// revalidate — 목록 + 해당 상세
// =============================================================================

/**
 * 검수 화면 2곳 재검증. /admin/review는 status 신호등이, 상세는 text·status가 바뀐다.
 * 두 페이지 모두 layout force-dynamic 상속이라 실효는 미세하나, books/actions.ts의
 * revalidatePath 표준 박제를 따른다(향후 캐시 도입 시 자동 동기).
 *
 * 공개면(/home·/library)은 재검증하지 않는다 — 검수 상태는 공개 노출과 무관하다
 * (공개 단일진실은 books.is_active, ADR-0046 D6).
 */
function revalidateReviewTargets(bookId: string): void {
  revalidatePath('/admin/review');
  revalidatePath(`/admin/review/${bookId}`);
}

/**
 * 현재 book_review.status를 service role로 조회한다(가드 통과 후 호출 전제).
 *
 * @returns 행이 없으면 null.
 */
async function readCurrentStatus(
  admin: ReturnType<typeof createServiceRoleClient>,
  bookId: string,
): Promise<ReviewStatus | null> {
  const { data, error } = await admin
    .from('book_review')
    .select('status')
    .eq('book_id', bookId)
    .maybeSingle<{ status: ReviewStatus }>();

  if (error || !data) {
    return null;
  }
  return data.status;
}

// =============================================================================
// saveReviewText — book_text.text 1페이지 저장 (ADR-0051 D2)
// =============================================================================

/**
 * 한 페이지의 낭독 확정본을 저장한다.
 *
 * @param input { bookId: UUID, pageIndex: int>=0, text: string } — 외부 신뢰 0
 * @returns { ok: true } 또는 { ok: false, error }
 *
 * UPDATE 컬럼: text 단일. blocks·source·page_index·book_id UPDATE 0건(ADR-0051 D2).
 * 상태 조건: 현재 status === 'in_review' 일 때만 저장. 그 외는 거부(D3).
 */
export async function saveReviewText(
  input: unknown,
): Promise<ReviewMutationResult> {
  // ① zod
  const parsed = saveReviewTextSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: '입력값을 다시 확인해 주세요.' };
  }

  // ②+③ assertAdmin (auth + role IN admin·curator)
  const adminCheck = await assertAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  // ④ service role — RLS 우회는 이 아래 문장들에만 국한
  const admin = createServiceRoleClient();

  // 상태 검증 — 클라이언트 잠금을 신뢰하지 않는다(ADR-0051 D3)
  const current = await readCurrentStatus(admin, parsed.data.bookId);
  if (current === null) {
    return { ok: false, error: '검수 대상 책을 찾을 수 없습니다.' };
  }
  if (current !== 'in_review') {
    return {
      ok: false,
      error: '검수중 상태에서만 저장할 수 있습니다. 화면을 새로고침해 주세요.',
    };
  }

  const { data, error } = await admin
    .from('book_text')
    .update({ text: parsed.data.text })
    .eq('book_id', parsed.data.bookId)
    .eq('page_index', parsed.data.pageIndex)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error) {
    return {
      ok: false,
      error: '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }
  if (!data) {
    return { ok: false, error: '해당 페이지를 찾을 수 없습니다.' };
  }

  revalidateReviewTargets(parsed.data.bookId);

  return { ok: true };
}

// =============================================================================
// transitionReviewStatus — book_review.status 전이 (ADR-0051 D3)
// =============================================================================

/**
 * 검수 상태를 전이한다.
 *
 * @param input { bookId: UUID, to: 'in_review' | 'confirmed' } — 외부 신뢰 0
 * @returns { ok: true } 또는 { ok: false, error }
 *
 * UPDATE 컬럼: status·reviewed_at·reviewer_id. note는 미사용(화면 입력 0건).
 * reviewer_id = assertAdmin이 반환한 ctx.profile.id (= profiles.id, book_review.reviewer_id
 * 의 참조 대상). "마지막으로 상태를 움직인 사람" 기록이다.
 *
 * 허용 전이는 ALLOWED_TRANSITIONS 표에만 의존한다 — 현재 status를 DB에서 다시 읽어
 * 판정하므로 화면이 낡은 상태를 들고 있어도 잘못된 전이가 통과하지 않는다.
 */
export async function transitionReviewStatus(
  input: unknown,
): Promise<ReviewMutationResult> {
  // ① zod
  const parsed = transitionReviewStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: '요청한 상태 변경이 올바르지 않습니다.' };
  }

  // ②+③ assertAdmin
  const adminCheck = await assertAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  // ④ service role
  const admin = createServiceRoleClient();

  const current = await readCurrentStatus(admin, parsed.data.bookId);
  if (current === null) {
    return { ok: false, error: '검수 대상 책을 찾을 수 없습니다.' };
  }

  // 전이 검증 — 표에 없는 전이는 전부 거부
  if (!ALLOWED_TRANSITIONS[current].includes(parsed.data.to)) {
    return {
      ok: false,
      error: '허용되지 않는 상태 변경입니다. 화면을 새로고침해 주세요.',
    };
  }

  const { data, error } = await admin
    .from('book_review')
    .update({
      status: parsed.data.to,
      reviewed_at: new Date().toISOString(),
      reviewer_id: adminCheck.ctx.profile.id,
    })
    .eq('book_id', parsed.data.bookId)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error) {
    return {
      ok: false,
      error: '상태 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }
  if (!data) {
    return { ok: false, error: '검수 대상 책을 찾을 수 없습니다.' };
  }

  revalidateReviewTargets(parsed.data.bookId);

  return { ok: true };
}
