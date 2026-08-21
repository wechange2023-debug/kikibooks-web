import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { HelpCircle, Sparkles } from 'lucide-react';

import { CelebrateRewards } from '@/components/book/celebrate-rewards';
import { ONBOARDING_PATH, SIGN_IN_PATH } from '@/lib/auth/routes';
import { getCelebrateCopy, getQuizCopy } from '@/lib/book/copy';
import { getBookByIdIncludingInactive } from '@/lib/book/detail';
import { getActiveChild } from '@/lib/home/active-child';
import { createClient } from '@/lib/supabase/server';
import { hasBookQuiz } from '@/lib/quiz/quiz-source';
import { hasWordPlay } from '@/lib/wordplay/get-word-play';
import { BRAND_NAME } from '@/lib/brand';

/**
 * /book/[id]/celebrate — Screen 05 완독 축하 (phase-13 CP2-e 정식 보상).
 *
 * phase-12 minimal placeholder를 정식 보상으로 확장(CP2-e — CP2의 마지막 sub-step).
 * FinishButton 클릭 → completeReadingSession이 reading_sessions UPDATE + awardCompletionRewards
 * (secret 키 옵션 B)로 children.points +50 + child_badges upsert를 적립한 뒤 본 페이지로
 * redirect한다. 본 페이지는 적립 결과를 본인 세션으로 SELECT만 하고, §7.3 모션(별 3개·포인트
 * 카운터·배지)을 CelebrateRewards 컴포넌트로 재생한다.
 *
 * ★ 보상 쓰기 0건 (ADR-0018 D3 멱등 앵커 보호):
 *   /celebrate는 재방문 가능(뒤로가기·새로고침·URL 직접)하므로 page-load 시점 보상 적립은
 *   중복 +50 위험. 모든 쓰기는 completeReadingSession 내부의 awardCompletionRewards에
 *   집중되고, 본 페이지는 본인 세션 SELECT만 한다(intent §4.3 정합). 재방문 시 모션은 다시
 *   재생되지만 DB는 변동 0건이다.
 *
 * badgeNewlyEarned 결정 — 옵션 H (CP2-e 박제 우선 정정 19):
 *   intent §10 #4가 CP1-adr에 위임했으나 ADR-0018 본문에 명시 결정이 누락돼 CP2-e가 박제.
 *   본인 세션 SELECT 2건 Promise.all (RLS §9.4·§9.6):
 *     (1) reading_sessions where child_id AND is_completed=true LIMIT 2 → 완독 세션 카디널리티
 *     (2) child_badges where child_id AND badge_code='first_completion' .maybeSingle()
 *   판정:
 *     - 카디널리티 == 1 (이번이 첫 완독) + 배지 행 존재 → badgeNewlyEarned=true (배지 모션 재생)
 *     - 카디널리티 ≥ 2 (재독) → false (배지 섹션 미렌더, 이미 보유한 배지를 또 강조 회피)
 *     - 배지 행 부재 (보상 실패) → false (배지 미표시 — 데이터 정직성)
 *   기각 옵션: A(earned_at 시각 임계 임의)·B(complete_at 임계 복잡)·C(항상 표시, 강건성 약함)·
 *     D(URL searchParam, closed env 노출)·E(보유 여부 의미 재정의, CP2-d prop 의미 후퇴).
 *   옵션 H 우위: first_completion 이름 의미 정합 + 시각 비교 임계 0건 + closed env URL 노출
 *     0건 + CP2-d JSDoc prop 의미 보존 + 정확성 100%.
 *
 * 가드 4종 (옵션 P — phase-12 보존):
 *   1. params.id UUID 형식 불일치 → notFound (DB 호출 방지)
 *   2. 미인증 → redirect(/login) (미들웨어 1차, 본 페이지 2차 안전망)
 *   3. 자녀 0명 → redirect(/onboarding) (축하 문구에 자녀명 필요)
 *   4. books 행 NULL (책이 없음·RLS 차단) → notFound
 *
 * ★ 비활성 도서 분기 0건 (ADR-0063 **D5**, 2026-08-19): 조회를
 *   getBookByIdIncludingInactive로 바꿔 is_active=false인 책도 **축하 화면을 그대로**
 *   보여준다. D2(안내 화면)·D3(redirect)를 적용하지 않는다.
 *     - 이미 읽은 사실과 지급된 포인트는 유효하다 — 축하를 취소할 이유가 없다.
 *     - 본 화면에는 다시 읽기 진입점이 없어 D3의 취지를 침범하지 않는다.
 *     - 완독 직후는 아이에게 가장 민감한 순간이라, 여기서 404를 띄우는 것이
 *       ADR-0059 O-8이 없애려 한 상실감을 가장 나쁜 타이밍에 만든다.
 *   책 자체가 없을 때의 notFound(가드 4)는 그대로 유지한다.
 *
 * Cache 정책 (ADR-0018 D11 — phase-12 무변경):
 *   export const dynamic = 'force-dynamic' — 자녀명·책 제목·points·badge가 매번 fresh.
 *   metadata robots noindex — closed environment(ADR-0013 결정 4), app/robots.ts '/book'
 *   disallow와 정합.
 *
 * Server Component — 가드·fetch·조립만. 인터랙션은 CelebrateRewards('use client')에 위임.
 *
 * 의도 문서: docs/intent/screen-05-celebrate.md §4.3·§5.2·§6·§7
 * ADR: docs/adr/0018-completion-rewards-and-library.md D3·D5·D6·D11·D13
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `완독 축하 · ${BRAND_NAME}`,
  robots: { index: false, follow: false },
};

/** 표준 UUID 형식 (read/page.tsx와 동일 — 옵션 P 복사). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** phase-13 CP3 정식 구현되는 라이브러리 경로 (PROTECTED_PREFIXES에 phase-12 등록 완료). */
const LIBRARY_PATH = '/library';

/** 단어 놀이 전용 화면 경로 (ADR-0065 Amendment #2 D-B1 · Q-1). */
const wordPlayPath = (bookId: string) => `/book/${bookId}/wordplay`;

/** 책 퀴즈 전용 화면 경로 (ADR-0065 Amendment #2 D-B1 · Q-2b). */
const quizPath = (bookId: string) => `/book/${bookId}/quiz`;

/**
 * 완독 1회당 적립 포인트 — CelebrateRewards count-up 목표값.
 *
 * ★ lib/book/rewards.ts의 POINTS_PER_COMPLETION 상수와 동기(ADR-0018 D5 매 완독 +50).
 *   rewards.ts는 'use server' 모듈이라 비-async export(상수)를 회피하고 본 페이지에서 사본을
 *   박제한다. 두 상수가 어긋나면 count-up 표시와 DB 실제 +50이 불일치 — 변경 시 둘 다 갱신.
 */
const POINTS_AWARDED = 50;

/** 완독 배지 코드 (rewards.ts FIRST_COMPLETION_BADGE와 동기, ADR-0018 D6 단일). */
const FIRST_COMPLETION_BADGE = 'first_completion';

interface CelebratePageProps {
  params: { id: string };
}

export default async function CelebratePage({ params }: CelebratePageProps) {
  // 가드 1: UUID 형식 사전 차단 — DB 호출 방지 + 보안
  if (!UUID_RE.test(params.id)) {
    notFound();
  }

  // 가드 2: 미인증 안전망 — 미들웨어가 1차, 본 페이지가 2차 (phase-07 정합)
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(SIGN_IN_PATH);
  }

  // 3-fetch 병렬 — book + child + copy 의존성 없음 (read/page.tsx 패턴 정합)
  const [book, child, celebrateCopy, quizCopy] = await Promise.all([
    getBookByIdIncludingInactive(supabase, params.id),
    getActiveChild(supabase, user.id),
    getCelebrateCopy(),
    getQuizCopy(),
  ]);

  // 가드 4: books 행 NULL → notFound (ADR-0063 D5 — is_active 분기는 두지 않는다)
  if (!book) {
    notFound();
  }

  // 가드 3: 자녀 0명 → 온보딩 (축하 문구에 자녀명 필요)
  if (!child) {
    redirect(ONBOARDING_PATH);
  }

  // 옵션 H — badgeNewlyEarned 결정용 본인 세션 SELECT 2건 병렬 (RLS §9.4·§9.6).
  // 본 페이지는 읽기 전용 — 보상 쓰기는 awardCompletionRewards가 redirect 전에 완료(D3).
  const [completedSessionsResult, badgeResult] = await Promise.all([
    supabase
      .from('reading_sessions')
      .select('id')
      .eq('child_id', child.id)
      .eq('is_completed', true)
      .limit(2),
    supabase
      .from('child_badges')
      .select('id')
      .eq('child_id', child.id)
      .eq('badge_code', FIRST_COMPLETION_BADGE)
      .maybeSingle<{ id: string }>(),
  ]);

  // 허브 버튼 1·2의 **진입 가능 여부만** 판정한다 (ADR-0065 Amendment #2 D-B1 · Q-1·Q-2b).
  // 놀이 자체는 /wordplay·/quiz로 빠졌으므로 celebrate는 카드도 문항도 필요 없다.
  // false면 그 버튼을 렌더하지 않는다 — 안내 문구·비활성 버튼도 두지 않는다(D2 조용한 미표시).
  // 두 판정은 서로 독립이라 병렬로 돌린다. 둘 다 SELECT만 한다.
  // ★ 읽기 전용이다. 무기록 원칙(D1)상 이 경로에도 쓰기는 0건이다.
  const [wordPlayAvailable, quizAvailable] = await Promise.all([
    hasWordPlay(supabase, book.id),
    hasBookQuiz(supabase, book, quizCopy.questionPrompts),
  ]);

  // 완독 카디널리티 == 1(첫 완독) + 배지 행 존재 → newly. ≥2(재독) 또는 배지 부재 → false.
  const completedCount = completedSessionsResult.data?.length ?? 0;
  const isFirstCompletion = completedCount === 1;
  const badgeOwned = badgeResult.data !== null;
  const badgeNewlyEarned = isFirstCompletion && badgeOwned;

  // buildSubtitle은 server-only(copy.ts)에서만 평가 — 결과 문자열만 렌더된다.
  const subtitle = celebrateCopy.buildSubtitle(child.name, book.title);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-surface-2 px-6 py-12 text-center">
      <div className="flex flex-col items-center gap-3">
        <h1 className="font-display text-h1 font-bold text-text">{celebrateCopy.title}</h1>
        <p className="text-body text-text-variant">{subtitle}</p>
      </div>

      {/* §7.3 보상 모션 (CP2-d 신규 + CP2-e 조립) — 별 3개·포인트 카운터·배지(신규 시) */}
      <CelebrateRewards
        pointsAwarded={POINTS_AWARDED}
        pointsLabel={celebrateCopy.pointsLabel}
        badgeLabel={celebrateCopy.badgeLabel}
        badgeNewlyEarned={badgeNewlyEarned}
      />

      {/* 허브 버튼 3종 (ADR-0065 Amendment #2 D-B1 · D-B7) — 보상 표시 아래.

          버튼 1·2는 각자 조건이 맞는 책에서만 렌더한다(D2 조용한 미표시) — 안내 문구도
          비활성 버튼도 두지 않는다. 두 판정은 **화면이 쓰는 함수와 같은 함수**를 쓴다
          (hasWordPlay / hasBookQuiz) — 그래야 "버튼은 보이는데 들어가면 빈 화면"이 없다.

          강제가 아니다(D-B7 존속) — 무시하고 책장으로 갈 수 있어야 한다. 그래서 버튼 1·2가
          둘 다 없어도(대상 외 도서) 책장 버튼은 항상 남는다. */}
      <div className="flex w-full max-w-md flex-col items-center gap-3">
        {wordPlayAvailable && (
          <Link
            href={wordPlayPath(book.id)}
            className="inline-flex h-[52px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-pill bg-cta px-8 text-body font-semibold text-on-cta shadow-elev-cta transition-all duration-200 ease-kiki hover:-translate-y-px hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta/50 focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <Sparkles className="h-5 w-5" aria-hidden="true" />
            {celebrateCopy.wordPlayLinkLabel}
          </Link>
        )}

        {quizAvailable && (
          <Link
            href={quizPath(book.id)}
            className="inline-flex h-[52px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-pill bg-cta px-8 text-body font-semibold text-on-cta shadow-elev-cta transition-all duration-200 ease-kiki hover:-translate-y-px hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta/50 focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <HelpCircle className="h-5 w-5" aria-hidden="true" />
            {celebrateCopy.quizLinkLabel}
          </Link>
        )}

        <Link
          href={LIBRARY_PATH}
          className="inline-flex h-[52px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-pill border border-outline bg-surface px-8 text-body font-semibold text-text transition-colors duration-200 ease-kiki hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          {celebrateCopy.libraryLinkLabel}
        </Link>
      </div>
    </main>
  );
}
