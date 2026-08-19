import { CategoryCarousel } from '@/components/home/category-carousel';
import { PopularBooks } from '@/components/landing/popular-books';
import { ValueProps } from '@/components/landing/value-props';
import { MainHero } from '@/components/main/main-hero';
import { SIGNUP_PATH } from '@/lib/auth/routes';
import type { CategoryDefinition, CategorySlug } from '@/lib/home/categories';
import type { HomeCopy } from '@/lib/home/copy';
import type { LandingCopy } from '@/lib/landing/copy';
import type { PopularBook } from '@/lib/landing/popular-books';

/**
 * 비로그인 방문자용 메인 블록 — 히어로 · 핵심 가치 · 인기 책 · 카테고리.
 *
 * ADR-0062 D1 — `/`가 비로그인 상태일 때 주입하는 블록 묶음이다. `MemberMain`과
 * 짝을 이루며, 둘 다 **데이터 fetch를 하지 않는다**(전부 props). 호출부(`app/page.tsx`)가
 * 병렬 fetch를 소유한다.
 *
 * ★ 카테고리 캐러셀은 로그인 여부와 무관한 **공통 블록**이다(D1 표).
 *   비로그인에게는 "무엇이 있는지" 보여주는 마케팅 자산이다. 다만 타일 링크는
 *   `signedIn={false}`로 **`/signup`을 향한다**(ADR-0062 **O-M2 확정**) —
 *   `/library`는 보호 라우트라 비로그인이 누르면 `/login`으로 튀기 때문이다.
 *
 * 헤더·푸터는 본 컴포넌트가 갖지 않는다. `/` 페이지가 상태로 고른다(D5):
 *   비로그인 `LandingHeader` / 로그인 `AppHeader`, 푸터는 양쪽 다 `AppFooter`(O-M3).
 *
 * 블록 순서는 v1 랜딩(히어로 → 핵심 가치 → 인기 책)을 유지하고 카테고리를 덧붙였다 —
 * 마케팅 설득 순서를 바꾸는 것은 본 ADR 범위가 아니다.
 *
 * Server Component — 정적 렌더.
 */

interface AnonymousMainProps {
  copy: LandingCopy;
  homeCopy: HomeCopy;
  books: PopularBook[];
  categories: readonly CategoryDefinition[];
  distribution: Record<CategorySlug, number>;
}

export function AnonymousMain({
  copy,
  homeCopy,
  books,
  categories,
  distribution,
}: AnonymousMainProps) {
  return (
    <>
      {/*
        ADR-0062 Amd.2 — 히어로는 로그인 상태와 **같은 컴포넌트·같은 클래스**다.
        v1의 색 블록 6장 장식은 폐기하고 실표지 3장으로 통일했다(A2-1).
        표지 데이터는 이미 조회한 인기 책 상위 3권을 재사용한다 — 신규 쿼리 0건(A2-4).
        아래 인기 책 그리드와 표지가 겹치나 제거하지 않는다(A2-5).
      */}
      <div className="px-4 pt-6 md:px-6">
        <MainHero
          title={copy.hero.title}
          subtitle={copy.hero.subtitle}
          ctaHref={SIGNUP_PATH}
          ctaLabel={copy.hero.ctaLabel}
          books={books}
          signedIn={false}
        />
      </div>
      <ValueProps items={copy.valueProps} />
      <PopularBooks copy={copy.popularSection} books={books} signedIn={false} />

      <section className="bg-bg px-4 pb-12 md:px-6 sm:pb-16">
        <div className="mx-auto max-w-5xl">
          <CategoryCarousel
            categories={categories}
            copy={homeCopy.categories}
            distribution={distribution}
            signedIn={false}
          />
        </div>
      </section>
    </>
  );
}
