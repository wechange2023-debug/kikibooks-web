import { CategoryCarousel } from '@/components/home/category-carousel';
import { LevelSelector } from '@/components/home/level-selector';
import { RecommendationList } from '@/components/home/recommendation-list';
import { StreakChart } from '@/components/home/streak-chart';
import { PopularBooks } from '@/components/landing/popular-books';
import { ValueProps } from '@/components/landing/value-props';
import { MainHero } from '@/components/main/main-hero';
import { LIBRARY_PATH } from '@/lib/auth/routes';
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

/**
 * 자녀 프로필 칩 — 히어로 뱃지 슬롯에 주입한다(로그인 전용).
 *
 * `home-hero.tsx`가 폐기되며(ADR-0062 Amd.2) 이 조각만 옮겨 왔다.
 *
 * ★ 대비 교정 승계: 이니셜 칩은 `bg-level-N-container` + `text-text`를 쓴다.
 *   v1은 `bg-level-N`(진한 색)에 `text-text`를 얹어 4.05:1(level-1)·3.39:1(level-5)로
 *   **AA 미달**이었다. §1.7 규칙 1("level-N은 스트로크·도트 전용")·규칙 2에 따라
 *   container 조합으로 바꿨다(13.3~14.5:1).
 *
 * 동적 클래스 회피(D11): 레벨별 클래스는 정적 매핑으로 박제한다.
 */
const LEVEL_CHIP_CLASSES: Record<number, string> = {
  1: 'bg-level-1-container',
  2: 'bg-level-2-container',
  3: 'bg-level-3-container',
  4: 'bg-level-4-container',
  5: 'bg-level-5-container',
};

/** child.age는 NULL 가능 — 표시할 때만 사용. */
function formatChildLabel(child: ActiveChild): string {
  const ageLabel = typeof child.age === 'number' ? `만 ${child.age}세` : '';
  const parts = [child.name, ageLabel, `Lv.${child.current_level}`].filter(
    (part) => part.length > 0,
  );
  return parts.join(' · ');
}

function ChildBadge({ child }: { child: ActiveChild }) {
  const chipClass = LEVEL_CHIP_CLASSES[child.current_level] ?? 'bg-surface-3';

  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 items-center justify-center rounded-pill text-label font-bold text-text ${chipClass}`}
      >
        {[...child.name][0] ?? '?'}
      </span>
      <span className="inline-flex h-[38px] items-center rounded-pill bg-surface px-4 text-label font-medium text-text">
        {formatChildLabel(child)}
      </span>
    </div>
  );
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
        {/*
          ADR-0062 Amd.2 — 히어로는 비로그인과 **같은 컴포넌트·같은 클래스**다.
          바뀌는 것은 데이터뿐: 인사말·자녀 칩·CTA 대상·표지 출처(오늘의 추천 상위 3권).
          books는 추천 캐러셀과 같은 배열 재사용 — 히어로용 신규 쿼리 0건.
        */}
        <MainHero
          title={greeting.primary}
          subtitle={greeting.subtitle}
          badge={<ChildBadge child={child} />}
          ctaHref={LIBRARY_PATH}
          ctaLabel="책 보러 가기"
          books={recommendation.books}
          signedIn
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
