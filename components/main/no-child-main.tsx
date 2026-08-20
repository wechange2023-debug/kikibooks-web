import { CategoryCarousel } from '@/components/home/category-carousel';
import { PopularBooks } from '@/components/landing/popular-books';
import { MainHero } from '@/components/main/main-hero';
import { ONBOARDING_PATH } from '@/lib/auth/routes';
import type { ChildOptionalCopy } from '@/lib/child-optional/copy';
import type { CategoryDefinition, CategorySlug } from '@/lib/home/categories';
import type { HomeCopy } from '@/lib/home/copy';
import type { LandingCopy } from '@/lib/landing/copy';
import type { PopularBook } from '@/lib/landing/popular-books';

/**
 * 로그인했으나 **자녀 프로필이 없는** 사용자용 메인 블록 — ADR-0064 **D1**.
 *
 * 종전에는 이 상태가 `redirect(ONBOARDING_PATH)`로 되돌려져 화면 자체가 없었다
 * (`app/page.tsx:146-148`). ADR-0064 A안이 그 결정을 뒤집는다 — 공부방·학원 선생님처럼
 * 자녀가 없는 성인도 **열람은 할 수 있어야** 하기 때문이다.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 왜 AnonymousMain을 재사용하지 않는가 (ADR-0064 **O-K1 결론**)
 * ──────────────────────────────────────────────────────────────────────────────
 *   `components/main/anonymous-main.tsx`는 비로그인 전용이며 `signedIn={false}`·
 *   `ctaHref={SIGNUP_PATH}`가 4곳에 박혀 있다. 그 파일을 파라미터화하면 **이미 검수를
 *   마친 비로그인 표면에 상태 분기가 유입**된다. 별도 컴포넌트를 두어 비로그인 표면을
 *   무접촉으로 남긴다.
 *
 *   ★ 그 결과 D1이 전제로 걸었던 "하드코딩 4곳 해소"는 **적용되지 않는다** —
 *     AnonymousMain이 로그인 사용자에게 렌더되지 않으므로 `/signup` 오동선 경로가
 *     애초에 존재하지 않는다(팀장 판정 2026-08-20, 안 '가').
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 구성 — 히어로 → 인기 책 → 카테고리 (D1 명시 순서)
 * ──────────────────────────────────────────────────────────────────────────────
 *   개인화 블록(레벨·추천·스트릭)은 **전부 빠진다**. ADR-0064 §원칙 절이 정한
 *   "기록계 기능은 자녀 0명에게 일괄 숨김"의 적용이며, 화면별로 다시 판단하지 않는다.
 *
 *   상단 유도 카드는 **`MainHero` 무수정 재사용**이다(O-K1 승인 범위). CTA만
 *   `ONBOARDING_PATH`를 향하고 나머지 구도·클래스는 비로그인·개인화 메인과 같다 —
 *   ADR-0062 Amd.2가 확립한 "히어로 구도 통일"이 세 갈래 전부에서 유지된다.
 *   `badge` 슬롯은 비운다(자녀 칩이 없다).
 *
 *   표지 3장은 인기 책 상위 3권을 재사용한다 — **히어로용 신규 쿼리 0건**.
 *   `signedIn`은 **true**다: 이 사용자는 이미 로그인했으므로 표지·타일 링크가
 *   `/signup`이 아니라 `/book/[id]`·`/library`로 가야 한다
 *   (`hero-cover-stack.tsx:88` · `book-cover-card.tsx:65` · `category-carousel.tsx:86`·`:88`).
 *
 * 레이아웃: 풀폭 히어로는 본문 컨테이너 밖에 둔다(design-system v2 §6.4).
 *   카테고리 섹션의 전폭 래퍼는 `anonymous-main.tsx:68-70`과 같은 형태다 —
 *   같은 성격의 섹션이 두 갈래에서 다르게 보이지 않도록 클래스를 맞춘다.
 *
 * 데이터 fetch는 하지 않는다(전부 props). 호출부(`app/page.tsx`)가 fetch를 소유한다 —
 * `MemberMain`·`AnonymousMain`과 동일 계약.
 *
 * Server Component — 'use client' 없음.
 */

interface NoChildMainProps {
  /** 자녀 미등록 표면 카피 — `lib/child-optional/copy.ts` 단일 출처. */
  copy: ChildOptionalCopy;
  /** 인기 책 섹션 카피 — 비로그인 랜딩과 **같은 출처**를 쓴다. */
  landingCopy: LandingCopy;
  /** 카테고리 섹션 카피. */
  homeCopy: HomeCopy;
  /** 인기 책 랜덤 6권. 상위 3권은 히어로 표지로도 재사용된다. */
  books: PopularBook[];
  categories: readonly CategoryDefinition[];
  distribution: Record<CategorySlug, number>;
}

export function NoChildMain({
  copy,
  landingCopy,
  homeCopy,
  books,
  categories,
  distribution,
}: NoChildMainProps) {
  return (
    <>
      <div className="px-4 pt-6 md:px-6">
        <MainHero
          title={copy.hero.title}
          subtitle={copy.hero.subtitle}
          ctaHref={ONBOARDING_PATH}
          ctaLabel={copy.hero.ctaLabel}
          books={books}
          signedIn
        />
      </div>

      {/* 인기 책 — 자체 전폭 <section>(px-5 py-12 + 내부 max-w-5xl)을 갖는다. */}
      <div className="mt-10">
        <PopularBooks copy={landingCopy.popularSection} books={books} signedIn />
      </div>

      <section className="bg-bg px-4 pb-12 md:px-6 sm:pb-16">
        <div className="mx-auto max-w-5xl">
          <CategoryCarousel
            categories={categories}
            copy={homeCopy.categories}
            distribution={distribution}
            signedIn
          />
        </div>
      </section>
    </>
  );
}
