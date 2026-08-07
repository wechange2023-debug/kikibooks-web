'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getActiveChild } from '@/lib/home/active-child';
import { createClient } from '@/lib/supabase/server';

/**
 * 즐겨찾기 토글 server action — 책 상세의 FavoriteButton이 호출한다.
 *
 * 결정 근거: ADR-0024 Amendment O1(2026-08-07) — D5-a 즐겨찾기 추가/해제 토글을 베타에
 *   포함하고, [토글 버튼] → [마이페이지 화면] 순으로 구현한다. 토글이 없으면 마이페이지의
 *   즐겨찾기 섹션이 구조적으로 항상 빈 목록이 되어 검수가 불가능하기 때문이다.
 *   목록의 귀속지는 마이페이지 섹션(Amendment O5) — /library?fav=true 기술은 구정보.
 *
 * baseline 패턴 (lib/book/reading-session.ts 직역):
 *   'use server' 최상단 → zod 입력 검증(입력 신뢰 0) → auth.getUser() → getActiveChild()로
 *   child_id 해소 → 본인 세션 클라이언트로 쓰기 → .select('id').maybeSingle()로 affected_rows
 *   검증(0행이면 명시 error). 새 패턴 창작 0건.
 *
 * 예외 정책: 미로그인·활성 자녀 없음·DB 실패 모두 **throw 금지**, { ok:false, error } 반환.
 *   호출자(FavoriteButton)가 옵티미스틱 UI를 롤백하고 인라인 메시지를 표시한다.
 *
 * 쓰기 방식 (RLS 제약 정합 — 001 §9.5):
 *   favorites의 정책은 SELECT / INSERT / DELETE 3종뿐이고 **UPDATE 정책이 없다.**
 *   따라서 토글은 조회 후 INSERT 또는 DELETE로만 구현한다.
 *   upsert / ON CONFLICT DO UPDATE는 UPDATE 경로를 타므로 **사용 금지**.
 *
 * 보안 (Hard Rule 6):
 *   createClient()는 본인 세션 클라이언트 — secret 키 미사용.
 *   RLS(001 §9.5 child_id IN (SELECT id FROM children WHERE parent_id = auth.uid()))가
 *   1차 방어선, .eq('child_id', child.id) 명시 필터가 2차 방어선. 다른 사용자의 자녀
 *   즐겨찾기는 0행 쓰기가 되며 0행을 명시 error로 잡는다.
 *
 * 스키마: supabase/migrations/001_initial_schema.sql lines 140~147
 *   favorites(id, child_id FK→children ON DELETE CASCADE, book_id FK→books, created_at)
 *   UNIQUE (child_id, book_id) — 중복 INSERT는 DB가 차단(23505).
 * RLS: 같은 파일 §9.5 (lines 276~290)
 */

/** 입력 신뢰 0 — bookId는 UUID 형식만 허용(책 상세 가드 1과 동일 형식 검증). */
const bookIdSchema = z.string().uuid({ message: 'bookId 형식이 올바르지 않습니다.' });

/**
 * 결과 — 성공 시 토글 **이후**의 상태(favorited)를 함께 돌려준다.
 * 호출자는 이 값으로 옵티미스틱 추정치를 서버 진실과 동기화한다.
 */
export type ToggleFavoriteResult =
  | { ok: true; favorited: boolean }
  | { ok: false; error: string };

/** Postgres unique_violation — UNIQUE (child_id, book_id) 동시 클릭 경합. */
const UNIQUE_VIOLATION = '23505';

/**
 * 책의 즐겨찾기를 토글한다.
 *
 * 동작:
 *   1. bookId zod 검증 → 실패 시 error.
 *   2. auth.getUser() → 미로그인이면 error(throw 금지).
 *   3. getActiveChild()로 활성 자녀 해소 → 자녀 0명이면 error.
 *      (읽기 세션과 달리 즐겨찾기는 child_id NOT NULL이라 자녀 없이는 쓰기 자체가 불가능하다.
 *       그래서 startReadingSession의 "자녀 0명 → ok:true 스킵"과 달리 명시 error로 반환한다.)
 *   4. (child_id, book_id) 조회 → 있으면 DELETE, 없으면 INSERT.
 *   5. revalidatePath(`/book/{bookId}`)로 책 상세의 초기 상태를 갱신.
 *
 * @param bookId 대상 책 UUID.
 */
export async function toggleFavorite(bookId: string): Promise<ToggleFavoriteResult> {
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

  // 현재 상태 조회 — UNIQUE (child_id, book_id)이므로 0행 또는 1행.
  const { data: existing, error: selectError } = await supabase
    .from('favorites')
    .select('id')
    .eq('child_id', child.id)
    .eq('book_id', parsed.data)
    .maybeSingle<{ id: string }>();

  if (selectError) {
    return { ok: false, error: '즐겨찾기 상태를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }

  if (existing) {
    // 해제 — DELETE (§9.5 "parents can delete own children favorites").
    const { data: deleted, error: deleteError } = await supabase
      .from('favorites')
      .delete()
      .eq('child_id', child.id)
      .eq('book_id', parsed.data)
      .select('id')
      .maybeSingle<{ id: string }>();

    if (deleteError) {
      return { ok: false, error: '즐겨찾기 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
    }

    // 0행 — RLS 차단(다른 사용자의 자녀) 또는 그 사이 이미 삭제됨.
    if (!deleted) {
      return { ok: false, error: '즐겨찾기를 해제하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
    }

    revalidatePath(`/book/${parsed.data}`);
    return { ok: true, favorited: false };
  }

  // 추가 — INSERT (§9.5 "parents can insert own children favorites").
  const { data: inserted, error: insertError } = await supabase
    .from('favorites')
    .insert({ child_id: child.id, book_id: parsed.data })
    .select('id')
    .maybeSingle<{ id: string }>();

  if (insertError) {
    // 동시 클릭 경합 — UNIQUE (child_id, book_id) 위반은 "이미 추가됨"과 같은 결과다.
    // upsert가 아니라 에러 분기 처리이므로 UPDATE 경로를 타지 않는다.
    if (insertError.code === UNIQUE_VIOLATION) {
      revalidatePath(`/book/${parsed.data}`);
      return { ok: true, favorited: true };
    }
    return { ok: false, error: '즐겨찾기 추가에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
  }

  // 0행 — RLS 차단(다른 사용자의 자녀 child_id).
  if (!inserted) {
    return { ok: false, error: '즐겨찾기를 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }

  revalidatePath(`/book/${parsed.data}`);
  return { ok: true, favorited: true };
}
