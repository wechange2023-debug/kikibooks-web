import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CategoryGrid } from '@/components/home/category-grid';
import { GreetingCard } from '@/components/home/greeting-card';
import { LevelSelector } from '@/components/home/level-selector';
import { RecommendationList } from '@/components/home/recommendation-list';
import { StreakChart } from '@/components/home/streak-chart';
import { ONBOARDING_PATH, SIGN_IN_PATH } from '@/lib/auth/routes';
import { getActiveChild } from '@/lib/home/active-child';
import { CATEGORIES, getCategoryDistribution } from '@/lib/home/categories';
import { getHomeCopy } from '@/lib/home/copy';
import { buildGreeting, getGreetingProfile } from '@/lib/home/greeting';
import { getRecommendations } from '@/lib/home/recommendations';
import { getStreakThisWeek } from '@/lib/home/streak';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: '홈 · 키키북스',
};

/**
 * /home — Screen 02 로그인 후 홈 정식 페이지.
 *
 * intent §4·§5 구성 5요소: 인사 카드 · 레벨 선택 바 · 오늘의 추천 5권 ·
 * 카테고리 그리드 8개 · 이번 주(월~일) 스트릭.
 *
 * 보호·가드 (intent §3·§4.2):
 *   - 비로그인 → /login (미들웨어가 1차 차단, 본 페이지가 안전망)
 *   - 자녀 0명 → /onboarding (페이지 안에서 redirect, cp1_decisions d4).
 *     middleware.ts는 자녀 0명 가드 하지 않음 — "분기는 도착 지점에서" 원칙
 *     (phase-08 onboarding-flow + ADR-0011 결정 1 계승).
 *
 * Cache 정책 (cp1_decisions d3):
 *   `export const dynamic = 'force-dynamic'` — 자녀별·세션별 데이터 결합으로 캐싱
 *   오작동 위험 회피 + revalidatePath('/home') 작동 보장 (LevelSelector server action).
 *
 * 카테고리 라우팅:
 *   CategoryGrid 카드는 /library?category={slug}로 이동한다(라이브러리 카테고리
 *   결과 재사용). 과거의 /home?cat= 안내 카드 분기는 제거됨 — 결과·빈 상태는
 *   라이브러리가 책임(ADR-0015 결정 5b 이연 해소).
 *
 * 데이터 fetch (P0-3(A) 왕복 병렬화, intent §4 + docs/intent/performance-track.md §3):
 *   1) auth (직렬, 가드 선행)
 *   2) activeChild-무관 fetch(profile·distribution)를 activeChild 가드와 겹쳐 착수
 *      — 두 쿼리는 user.id만·무의존이라 activeChild 조회를 기다릴 이유가 없다(왕복 1회 절감).
 *   3) activeChild (직렬 가드, d4) — null이면 redirect
 *   4) Promise.all — 겹쳐 착수한 promise를 activeChild 의존 쿼리(recommendation·streak)와 함께 수확
 *   5) buildGreeting() 순수 호출
 *
 * Server Component — 'use client' 없음. server action 호출은 LevelSelector(client) 책임.
 */

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(SIGN_IN_PATH);
  }

  // P0-3(A): activeChild-무관 fetch를 가드와 겹쳐 착수한다. profile(user.id)·distribution은
  // activeChild에 의존하지 않으므로 getActiveChild 왕복을 기다리지 않는다(왕복 1회 절감).
  // getHomeCopy는 정적(DB 미접근)이라 왕복 아님 — 참여시켜도 무해.
  const profilePromise = getGreetingProfile(supabase, user.id);
  const copyPromise = getHomeCopy();
  const distributionPromise = getCategoryDistribution(supabase);

  // 자녀 0명 → 온보딩 (d4). middleware는 본 분기를 하지 않음.
  const activeChild = await getActiveChild(supabase, user.id);
  if (!activeChild) {
    redirect(ONBOARDING_PATH);
  }

  // 겹쳐 착수한 promise + activeChild 의존 쿼리(recommendation·streak)를 함께 수확.
  const [profile, recommendation, streakDays, copy, distribution] = await Promise.all([
    profilePromise,
    getRecommendations(supabase, activeChild),
    getStreakThisWeek(supabase, activeChild.id),
    copyPromise,
    distributionPromise,
  ]);

  const greeting = buildGreeting(profile, activeChild, copy.greeting);

  return (
    <main className="min-h-screen bg-surface-2 py-6">
      <div className="mx-auto flex max-w-screen-sm flex-col gap-4 px-4 md:max-w-screen-md md:gap-5 md:px-6 lg:max-w-screen-lg">
        {/* 로그아웃·홈↔라이브러리 네비는 공통 헤더(components/app/app-header.tsx)로 수렴 — ADR-0021 D4. */}
        <GreetingCard greeting={greeting} child={activeChild} />

        <LevelSelector
          childId={activeChild.id}
          currentLevel={activeChild.current_level}
          copy={copy.levelSelector}
        />

        <RecommendationList result={recommendation} copy={copy.recommendations} />

        <CategoryGrid
          categories={CATEGORIES}
          copy={copy.categories}
          distribution={distribution}
        />

        <StreakChart days={streakDays} copy={copy.streak} />
      </div>
    </main>
  );
}
