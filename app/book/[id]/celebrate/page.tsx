import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { CelebrateRewards } from '@/components/book/celebrate-rewards';
import { ONBOARDING_PATH, SIGN_IN_PATH } from '@/lib/auth/routes';
import { getCelebrateCopy } from '@/lib/book/copy';
import { getBookById } from '@/lib/book/detail';
import { getActiveChild } from '@/lib/home/active-child';
import { createClient } from '@/lib/supabase/server';

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
 *   4. books 행 NULL (없음·is_active=false·RLS 차단) → notFound
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
  title: '완독 축하 · 키키북스',
  robots: { index: false, follow: false },
};

/** 표준 UUID 형식 (read/page.tsx와 동일 — 옵션 P 복사). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** phase-13 CP3 정식 구현되는 라이브러리 경로 (PROTECTED_PREFIXES에 phase-12 등록 완료). */
const LIBRARY_PATH = '/library';

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
  const [book, child, celebrateCopy] = await Promise.all([
    getBookById(supabase, params.id),
    getActiveChild(supabase, user.id),
    getCelebrateCopy(),
  ]);

  // 가드 4: books 행 NULL → notFound
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
        <h1 className="font-display text-3xl font-bold text-text">{celebrateCopy.title}</h1>
        <p className="text-base text-text-variant">{subtitle}</p>
      </div>

      {/* §7.3 보상 모션 (CP2-d 신규 + CP2-e 조립) — 별 3개·포인트 카운터·배지(신규 시) */}
      <CelebrateRewards
        pointsAwarded={POINTS_AWARDED}
        pointsLabel={celebrateCopy.pointsLabel}
        badgeLabel={celebrateCopy.badgeLabel}
        badgeNewlyEarned={badgeNewlyEarned}
      />

      <Link
        href={LIBRARY_PATH}
        className="inline-flex h-[52px] items-center justify-center gap-2 rounded-pill bg-primary px-8 text-base font-semibold text-on-primary shadow-elev-pop transition-all duration-200 ease-kiki hover:-translate-y-px hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
      >
        {celebrateCopy.libraryLinkLabel}
      </Link>
    </main>
  );
}
