import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CategoryGrid } from '@/components/home/category-grid';
import { GreetingCard } from '@/components/home/greeting-card';
import { LevelSelector } from '@/components/home/level-selector';
import { RecommendationList } from '@/components/home/recommendation-list';
import { StreakChart } from '@/components/home/streak-chart';
import { ONBOARDING_PATH, SIGN_IN_PATH } from '@/lib/auth/routes';
import { getActiveChild } from '@/lib/home/active-child';
import { CATEGORIES, isCategorySlug } from '@/lib/home/categories';
import { getHomeCopy } from '@/lib/home/copy';
import { buildGreeting, getGreetingProfile } from '@/lib/home/greeting';
import { getRecommendations } from '@/lib/home/recommendations';
import { getStreakLast7Days } from '@/lib/home/streak';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: '홈 · 키키북스',
};

/**
 * /home — Screen 02 로그인 후 홈 정식 페이지.
 *
 * intent §4·§5 구성 5요소: 인사 카드 · 레벨 선택 바 · 오늘의 추천 5권 ·
 * 카테고리 그리드 8개 · 최근 7일 스트릭.
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
 * searchParams 처리 (cp3_decisions d20·d21·d23·d24):
 *   - Next.js 14 동기 props 패턴 (d20) — await 없음
 *   - isCategorySlug() 통과 시 CategoryGrid 위에 안내 카드 1장 표시 (d21·d23)
 *   - 잘못된 slug는 너그러운 무시 (d24) — 정상 홈 그대로 렌더
 *   - 결과 페이지 구현은 phase-13b 라이브러리로 이연 (ADR-0015 결정 5b)
 *
 * 데이터 fetch (Promise.all 병렬, intent §4):
 *   1) auth (직렬, 가드 선행)
 *   2) activeChild (직렬, d4 가드)
 *   3) [profile, recommendation, streakDays, copy] 병렬
 *   4) buildGreeting() 순수 호출
 *
 * Server Component — 'use client' 없음. server action 호출은 LevelSelector(client) 책임.
 */

export const dynamic = 'force-dynamic';

interface HomePageProps {
  searchParams?: { cat?: string };
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(SIGN_IN_PATH);
  }

  // 자녀 0명 → 온보딩 (d4). middleware는 본 분기를 하지 않음.
  const activeChild = await getActiveChild(supabase, user.id);
  if (!activeChild) {
    redirect(ONBOARDING_PATH);
  }

  // 4개 fetch를 병렬로 — 서로 의존성 없음.
  const [profile, recommendation, streakDays, copy] = await Promise.all([
    getGreetingProfile(supabase, user.id),
    getRecommendations(supabase, activeChild),
    getStreakLast7Days(supabase, activeChild.id),
    getHomeCopy(),
  ]);

  const greeting = buildGreeting(profile, activeChild, copy.greeting);

  // d21·d24 — searchParams.cat 유효성 검사 + 안내 카드 카피 빌드.
  const requestedCat = searchParams?.cat;
  const matchedCategory =
    requestedCat && isCategorySlug(requestedCat)
      ? CATEGORIES.find((cat) => cat.slug === requestedCat)
      : undefined;
  const comingSoonMessage = matchedCategory
    ? copy.categories.comingSoonTemplate.replace('{label}', matchedCategory.labelKo)
    : null;

  return (
    <main className="min-h-screen bg-surface-2 py-6">
      <div className="mx-auto flex max-w-screen-sm flex-col gap-4 px-4 md:max-w-screen-md md:gap-5 md:px-6 lg:max-w-screen-lg">
        {/*
          로그아웃 form — phase-13b CP3-c hotfix 확장 (자진 신고 6번 해소).
          - 박제 정합: admin layout.tsx hotfix 58cf4a5 토큰·form 패턴 100% 정합 +
            docs/intent/auth-flow.md §4.6 4단계 흐름 + app/auth/sign-out/route.ts:9
            "form POST로 호출" 박제 직역.
          - 'use client' 0건 — native HTML form action + POST가 Server Component에서 동작.
          - 라벨 "로그아웃" hardcoded — copy.ts 박제 확장 회피 (자진 신고 5번 정책 정합).
            phase-13c follow-up 후보로 HomeCopy.signOut 키 박제 확장 검토.
          - GreetingCard 컴포넌트 수정 0건 — 본 page.tsx 헤더 영역만 신규 추가.
        */}
        <header className="flex items-center justify-end">
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              className="inline-flex items-center rounded-md border border-outline bg-surface px-2 py-1 text-xs font-medium text-text-variant transition-colors hover:bg-surface-2 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              로그아웃
            </button>
          </form>
        </header>

        <GreetingCard greeting={greeting} child={activeChild} />

        <LevelSelector
          childId={activeChild.id}
          currentLevel={activeChild.current_level}
          copy={copy.levelSelector}
        />

        {/* d21 안내 카드 — searchParams.cat 유효 시 1장 표시. */}
        {comingSoonMessage && (
          <aside
            role="status"
            aria-live="polite"
            className="rounded-md border border-outline bg-surface px-5 py-4 text-sm text-text-variant shadow-elev-1"
          >
            {comingSoonMessage}
          </aside>
        )}

        <RecommendationList result={recommendation} copy={copy.recommendations} />

        <CategoryGrid categories={CATEGORIES} copy={copy.categories} />

        <StreakChart days={streakDays} copy={copy.streak} />
      </div>
    </main>
  );
}
