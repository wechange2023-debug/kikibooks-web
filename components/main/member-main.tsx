import { CategoryCarousel } from '@/components/home/category-carousel';
import { HomeHero } from '@/components/home/home-hero';
import { LevelSelector } from '@/components/home/level-selector';
import { RecommendationList } from '@/components/home/recommendation-list';
import { StreakChart } from '@/components/home/streak-chart';
import type { ActiveChild } from '@/lib/home/active-child';
import type { CategoryDefinition, CategorySlug } from '@/lib/home/categories';
import type { HomeCopy } from '@/lib/home/copy';
import type { GreetingData } from '@/lib/home/greeting';
import type { RecommendationResult } from '@/lib/home/recommendations';
import type { StreakDay } from '@/lib/home/streak';

/**
 * 로그인 사용자용 메인 블록 — 인사 히어로 · 레벨 · 추천 · 카테고리 · 스트릭.
 *
 * ADR-0062 D1 — `/`가 로그인 상태일 때 주입하는 블록 묶음이다. 데이터 fetch는 하지
 * 않는다(전부 props). 호출부(`app/page.tsx`)가 병렬 fetch를 소유하고 본 컴포넌트는
 * **렌더만** 한다 — 그래야 같은 블록을 다른 진입점에서도 재사용할 수 있다.
 *
 * ADR-0062 §Consequences의 "단일 파일 복잡도" 위험에 대한 방어이기도 하다:
 * `/` 페이지에는 3갈래 분기만 남고, 블록 조립은 여기와 `AnonymousMain`이 나눠 갖는다.
 *
 * 레이아웃 (design-system v2 §6.4):
 *   풀폭 히어로는 본문 컨테이너(max-w-screen-*) **밖**에 둔다 — 컨테이너 안에 넣으면
 *   폭이 본문과 같아져 "풀폭"이 성립하지 않는다.
 *
 * Server Component — 'use client' 없음. 클라이언트 상태는 자식이 보유한다.
 */

interface MemberMainProps {
  greeting: GreetingData;
  child: ActiveChild;
  recommendation: RecommendationResult;
  streakDays: StreakDay[];
  copy: HomeCopy;
  categories: readonly CategoryDefinition[];
  distribution: Record<CategorySlug, number>;
}

export function MemberMain({
  greeting,
  child,
  recommendation,
  streakDays,
  copy,
  categories,
  distribution,
}: MemberMainProps) {
  return (
    <>
      <div className="px-4 pt-6 md:px-6">
        {/* books는 추천 캐러셀과 같은 배열 재사용 — 히어로용 신규 쿼리 0건. */}
        <HomeHero
          greeting={greeting}
          child={child}
          books={recommendation.books}
        />
      </div>

      <div className="mx-auto mt-8 flex max-w-screen-sm flex-col gap-8 px-4 md:max-w-screen-md md:px-6 lg:max-w-screen-lg">
        <LevelSelector
          childId={child.id}
          currentLevel={child.current_level}
          copy={copy.levelSelector}
        />

        <RecommendationList result={recommendation} copy={copy.recommendations} />

        <CategoryCarousel
          categories={categories}
          copy={copy.categories}
          distribution={distribution}
          signedIn
        />

        <StreakChart days={streakDays} copy={copy.streak} />
      </div>
    </>
  );
}
