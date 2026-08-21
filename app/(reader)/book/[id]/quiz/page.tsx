import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { BookQuiz } from '@/components/book/book-quiz';
import { SIGN_IN_PATH } from '@/lib/auth/routes';
import { getQuizCopy } from '@/lib/book/copy';
import { getBookByIdIncludingInactive } from '@/lib/book/detail';
import { createClient } from '@/lib/supabase/server';
import { eligibleQuestionIds } from '@/lib/quiz/build-quiz';
import { getQuizSource } from '@/lib/quiz/quiz-source';
import { BRAND_NAME } from '@/lib/brand';

/**
 * /book/[id]/quiz — 책 퀴즈 전용 화면 (ADR-0065 Amendment #2 D-B1·D-B3 · Q-2b).
 *
 * 문항 3종을 하 → 중 → 상 **고정 순서**로 낸다(QB-5). 조건 미달 문항은 건너뛴다 —
 * 억지로 채우지 않는다(2문항이 될 수 있다).
 *
 * ★ A안 — 가드를 두지 않는다 (D-B2):
 *   완독 여부·진입 경로를 **검사하지 않는다.** 주소를 직접 열어도 뜬다.
 *   → **`reading_sessions` 조회 0건.** wordplay와 같은 이유·같은 구조다
 *   (`app/(reader)/book/[id]/wordplay/page.tsx` 참조).
 *
 * ★ 자녀 0명도 들어온다 (ADR-0065 D6): 자녀 단위 데이터를 쓰지 않으므로 기록계가 아니다.
 *   축하 문구가 없어 자녀 이름도 필요 없다 → `getActiveChild` 호출 0건.
 *
 * ★ 무기록(D1 · D-B5): 이 경로 전체에서 INSERT/UPDATE **0건**. SELECT + Storage 읽기만.
 *
 * ★ 문항 조립을 서버에서 하지 않는 이유: "다시 하기 = 재추첨"(D-B2)이라 클라이언트가
 *   스스로 새로 뽑아야 한다. 서버는 **재료**(`QuizSource`)만 내려보내고, 조립은
 *   순수 함수 `buildQuiz`가 맡는다. 서버는 같은 재료로 **출제 가능 여부만** 판정한다.
 *
 * 가드 4종 (wordplay와 동형):
 *   1. params.id UUID 형식 불일치 → notFound
 *   2. 미인증 → redirect(/login) (미들웨어 1차 — PROTECTED_PREFIXES '/book', 본 페이지 2차)
 *   3. books 행 NULL → notFound
 *   4. 출제 가능 문항 0개 → notFound (D2 조용한 미표시 — 기존 404를 그대로 쓴다)
 *
 * ADR: docs/adr/0065-word-card-quiz-pilot.md D1·D2·D6 + Amendment #2 D-B1~D-B5
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `책 퀴즈 · ${BRAND_NAME}`,
  robots: { index: false, follow: false },
};

/** 표준 UUID 형식 (celebrate/page.tsx:78과 동일 — 가드 1). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface QuizPageProps {
  params: { id: string };
}

export default async function QuizPage({ params }: QuizPageProps) {
  // 가드 1: UUID 형식 사전 차단 — DB 호출 방지 + 보안
  if (!UUID_RE.test(params.id)) {
    notFound();
  }

  // 가드 2: 미인증 안전망 — 미들웨어가 1차, 본 페이지가 2차
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(SIGN_IN_PATH);
  }

  const [book, quizCopy] = await Promise.all([
    getBookByIdIncludingInactive(supabase, params.id),
    getQuizCopy(),
  ]);

  // 가드 3: books 행 NULL → notFound
  if (!book) {
    notFound();
  }

  const source = await getQuizSource(supabase, book, quizCopy.questionPrompts);

  // 가드 4: 출제 가능 문항 0개 → notFound (D2 조용한 미표시)
  if (eligibleQuestionIds(source).length === 0) {
    notFound();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface-2 px-4 py-12 sm:px-6">
      {/* 나가기는 celebrate 허브로 돌려보낸다 — 거기서 다음 놀이를 고를 수 있다(D-B1).
          확인 대화상자는 두지 않는다(D-B2 이탈 시 즉시 복귀). wordplay와 같은 규칙이다. */}
      <BookQuiz source={source} exitHref={`/book/${book.id}/celebrate`} />
    </main>
  );
}
