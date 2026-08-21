import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { BookQuiz } from '@/components/book/book-quiz';
import { SIGN_IN_PATH } from '@/lib/auth/routes';
import { getQuizCopy } from '@/lib/book/copy';
import { getBookByIdIncludingInactive } from '@/lib/book/detail';
import { createClient } from '@/lib/supabase/server';
import { buildQuiz, eligibleQuestionIds } from '@/lib/quiz/build-quiz';
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
 * ★ **첫 문항은 서버에서 뽑는다** (Q-2 수리 · 하이드레이션 불일치 해소):
 *   `buildQuiz`는 `Math.random()`을 쓴다. 종전에는 클라이언트의 `useState` 초기화 함수가
 *   이것을 호출했는데, 그 초기화 함수는 **SSR에서 한 번, 하이드레이션에서 또 한 번** 돈다.
 *   두 번의 추첨이 다르니 HTML의 `<img src>`(서버 추첨)와 메모리의 `answerKey`·`clipUrl`
 *   (클라이언트 추첨)이 어긋났다 — React는 구조가 같고 속성만 다르면 서버 값을 유지하기
 *   때문이다. 그 결과 **들리는 문장과 정답 그림이 맞지 않았다**(2026-08-21 팀장 실검).
 *   12면 책 기준 첫 진입의 99.8%가 어긋났다.
 *
 *   그래서 첫 추첨을 **여기서 한 번만** 하고 결과를 props로 내려보낸다. SSR HTML과
 *   클라이언트 초기 상태가 같은 추첨을 쓴다.
 *
 * ★ 그래도 재료(`QuizSource`)를 함께 내려보내는 이유: **"다시 하기 = 재추첨"**(D-B2).
 *   두 번째 이후의 추첨은 하이드레이션 이후라 안전하므로 클라이언트가 직접 한다 —
 *   서버 왕복 0건.
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

  // 첫 추첨은 여기서 **한 번만**. 클라이언트는 이 결과를 그대로 이어받는다(위 ★ 참조).
  const initialQuestions = buildQuiz(source);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface-2 px-4 py-12 sm:px-6">
      {/* 나가기는 celebrate 허브로 돌려보낸다 — 거기서 다음 놀이를 고를 수 있다(D-B1).
          확인 대화상자는 두지 않는다(D-B2 이탈 시 즉시 복귀). wordplay와 같은 규칙이다. */}
      <BookQuiz
        source={source}
        initialQuestions={initialQuestions}
        exitHref={`/book/${book.id}/celebrate`}
      />
    </main>
  );
}
