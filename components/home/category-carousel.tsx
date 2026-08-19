import Link from 'next/link';

import { SectionHeader } from '@/components/ui/section-header';
import { LIBRARY_PATH } from '@/lib/auth/routes';
import type { CategoryDefinition, CategorySlug } from '@/lib/home/categories';
import type { HomeCopy } from '@/lib/home/copy';

/**
 * 홈 카테고리 캐러셀 — v1 `components/home/category-grid.tsx`(2×4 그리드)를 대체한다.
 *
 * 디자인 인용 (design-system v2 §6.4 "카테고리 캐러셀"):
 *   - 가로 스크롤 + **스크롤 스냅**(snap-x mandatory / snap-start)
 *   - 아이템 radius `lg`(28px), 트랙 배경 `surface-3`
 *   - 아이템 최소 폭 120px 이상 — 작은 손가락 기준(여기서는 144px)
 *   - **터치 드래그와 키보드를 모두 지원**
 *
 * ★ 캐러셀 단독 도달 금지 (§6.4).
 *   카테고리는 캐러셀 밖에서도 전부 도달 가능해야 한다. 헤더의 "전체 보기" pill이
 *   `/library`로 보내며, 그 화면은 **8개 카테고리 필터를 갖춘 전체 그리드**다
 *   (`library-browser.tsx` handleCategoryChange · `library/page.tsx` searchParams.category).
 *   즉 캐러셀은 빠른 진입 경로일 뿐 유일 경로가 아니다.
 *
 * 키보드 접근 (§6.4 "터치 드래그와 키보드를 모두 지원"):
 *   - 각 타일이 <Link>라 Tab 이동 시 브라우저가 자동으로 스크롤 인투 뷰 한다.
 *   - 스크롤 컨테이너 자체에 tabIndex=0 + role/aria-label을 부여해 **화살표 키로도**
 *     트랙을 움직일 수 있게 한다(WCAG 2.1.1 — 스크롤 가능 영역의 키보드 조작).
 *
 * 스와치 색 복원 (design-system v2 §1.8 매핑):
 *   큐 D-3에서 v1 accent 8색이 폐기되며 전부 `bg-surface-3` 단색으로 임시 통일했던
 *   것을 v2 팔레트로 되돌린다. 매핑 근거는 §1.8 대응표 —
 *   `tertiary` → `accent-purple`, `accent-yellow` → `accent-mustard`,
 *   `accent-pink/green/sky/violet` → 폐기(레벨 토큰으로 흡수).
 *
 *   스와치는 `aria-hidden` 순수 색 블록이고 라벨 텍스트는 `bg-surface` 위에 있으므로
 *   텍스트 대비 제약이 없다. 다만 §1.9의 UI 경계 기준(3:1)은 만족한다 —
 *   level-1 4.20 · level-2 3.98 · level-4 4.21 · level-5/accent-purple 5.02 ·
 *   accent-mustard는 흰 배경 대비 1.78이나 **텍스트가 얹히지 않는 장식 블록**이라
 *   1.4.11 대상이 아니다(§1.3 금지 규칙은 "머스터드 위 텍스트"에 대한 것).
 *
 * 동적 클래스 회피(D11 패턴): slug별 클래스를 정적 매핑으로 박제한다.
 *
 * Server Component — 정적 렌더, 핸들러 없음.
 */

interface CategoryCarouselProps {
  categories: readonly CategoryDefinition[];
  copy: HomeCopy['categories'];
  distribution: Record<CategorySlug, number>;
}

/**
 * 카테고리 slug → 스와치 클래스 정적 매핑.
 * ADR-0015 결정 2.1 표를 v2 팔레트로 이관. CategorySlug union 8 키와 1:1 정합.
 *
 * v1 중복 패턴(animals=nature, family=emotions)은 그대로 보존한다.
 * abc는 §1.8의 `tertiary → accent-purple` 대응을 따르며, bedtime(v1 violet)은
 * 같은 보라 계열인 level-5로 간다 — 두 값이 같아 동색이 되지만, 타일마다 라벨
 * 텍스트가 붙으므로 식별에 문제가 없다(v1도 6색으로 8카테고리를 덮었다).
 */
const CATEGORY_SWATCH_CLASSES: Record<CategorySlug, string> = {
  animals: 'bg-level-1',
  family: 'bg-level-4',
  abc: 'bg-accent-purple',
  numbers: 'bg-level-2',
  emotions: 'bg-level-4',
  nature: 'bg-level-1',
  food: 'bg-accent-mustard',
  bedtime: 'bg-level-5',
};

export function CategoryCarousel({
  categories,
  copy,
  distribution,
}: CategoryCarouselProps) {
  return (
    <section aria-label={copy.title} className="flex flex-col gap-4">
      <SectionHeader title={copy.title} href={LIBRARY_PATH} />

      <ul
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 스크롤 영역의 키보드 조작(WCAG 2.1.1)
        tabIndex={0}
        aria-label={`${copy.title} 가로 스크롤 목록`}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto rounded-lg bg-surface-3 p-3 [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        {categories.map((category) => (
          <li key={category.slug} className="shrink-0 snap-start">
            <Link
              href={`${LIBRARY_PATH}?category=${category.slug}`}
              className="group flex w-36 flex-col gap-2 rounded-lg bg-surface p-3 shadow-elev-1 outline-none transition-transform duration-200 ease-kiki hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <span
                aria-hidden="true"
                className={`block h-16 w-full rounded-sm ${CATEGORY_SWATCH_CLASSES[category.slug]}`}
              />
              <span className="text-label font-semibold text-text">
                {category.labelKo}
              </span>
              <span className="text-caption font-normal text-text-variant">
                {distribution[category.slug]}권
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
