import { CategoryCarousel } from '@/components/home/category-carousel';
import { HomeHero } from '@/components/home/home-hero';
import { LevelSelector } from '@/components/home/level-selector';
import { RecommendationList } from '@/components/home/recommendation-list';
import { StreakChart } from '@/components/home/streak-chart';
import { PopularBooks } from '@/components/landing/popular-books';
import { ValueProps } from '@/components/landing/value-props';
import type { ActiveChild } from '@/lib/home/active-child';
import type { CategoryDefinition, CategorySlug } from '@/lib/home/categories';
import type { HomeCopy } from '@/lib/home/copy';
import type { GreetingData } from '@/lib/home/greeting';
import type { RecommendationResult } from '@/lib/home/recommendations';
import type { StreakDay } from '@/lib/home/streak';
import type { LandingCopy } from '@/lib/landing/copy';
import type { PopularBook } from '@/lib/landing/popular-books';

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
  /** 인기 책 랜덤 6권 — ADR-0062 Amd.1. 추천과 겹칠 수 있으나 제거하지 않는다. */
  popularBooks: PopularBook[];
  /** 인기 책·핵심가치 섹션 카피 — 비로그인 랜딩과 **같은 출처**를 쓴다. */
  landingCopy: LandingCopy;
}

export function MemberMain({
  greeting,
  child,
  recommendation,
  streakDays,
  copy,
  categories,
  distribution,
  popularBooks,
  landingCopy,
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

      {/*
        ADR-0062 Amendment 1 — 랜딩 섹션 병합.
        개인화 블록(위)이 자주 쓰는 것, 마케팅성 정보(아래)가 덜 급한 것이다.

        ★ 두 섹션은 자체 전폭 <section>(px-5 py-12 + 내부 max-w-5xl)을 갖는다.
          위 max-w-screen-* 컨테이너 **밖 형제**로 둬야 이중 제약이 걸리지 않는다.

        인기 책은 로그인 상태라 카드 링크가 /book/[id]로 간다(Amd.1 부수 결정 2).
        "오늘의 추천"과 책이 겹칠 수 있으나 제거하지 않는다(부수 결정 3).
        ValueProps에는 CTA 버튼이 없어 §6.1 "화면당 CTA 1개"가 그대로 지켜진다
        (실측: 정보 카드 4장뿐 — Amd.1 부수 결정 4).
      */}
      <div className="mt-10">
        <PopularBooks
          copy={landingCopy.popularSection}
          books={popularBooks}
          signedIn
        />
        <ValueProps items={landingCopy.valueProps} />
      </div>
    </>
  );
}
