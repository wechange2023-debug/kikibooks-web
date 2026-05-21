import Link from 'next/link';

import type { CategoryDefinition, CategorySlug } from '@/lib/home/categories';
import type { HomeCopy } from '@/lib/home/copy';

/**
 * 카테고리 그리드 8개 — 2×4 카드. 클릭 시 /home?cat={slug}로 라우팅.
 *
 * 책임: lib/home/categories.ts의 CATEGORIES 배열을 카드 8장으로 렌더하고,
 * 각 카드에 D11 정적 accent 클래스를 매핑한다.
 *
 * 디자인 인용:
 *   - design-system §6.2 정보 카드 — shadow-elev-1 + rounded-md + hover translateY
 *   - design-system §1.4 Accent 5색 — 카드 상단 색상 블록 (CTA 사용 금지, 식별용)
 *   - design-system §1.3 Tertiary — abc 카테고리만 tertiary 사용 (ADR-0015 §2.1)
 *
 * D11 (cp3_decisions): CATEGORY_ACCENT_CLASSES는 본 컴포넌트 내부 정적 매핑.
 *   lib/home/categories.ts(데이터) 무수정. 동적 클래스 조합 금지(Tailwind content
 *   스캐너 인식 보장).
 *
 * D13 (cp3_decisions): <Link>로 라우팅 → server 컴포넌트 유지. router.push 미사용.
 *
 * D16 (cp3_decisions): 매핑 키 8개가 CategorySlug union 8개와 1:1 정합 확인
 *   (CP3-a 작성 시 사전 점검 완료, ADR-0015 §2.1 인용).
 *
 * D19 (cp3_decisions): distribution 호출 없이 8 카드 균등 표시. 0건 카테고리도
 *   카드 노출 + 클릭 가능 — 결과 페이지(/home?cat=…)에서 ADR-0015 결정 6 폴백
 *   메시지로 처리(CP3-b 또는 phase-13b).
 *
 * Server Component — <Link> 사용, 핸들러 없음.
 */

interface CategoryGridProps {
  categories: readonly CategoryDefinition[];
  copy: HomeCopy['categories'];
}

/**
 * 카테고리 slug → Tailwind accent 클래스 정적 매핑 (D11).
 * ADR-0015 결정 2.1 표 인용. CategorySlug union 8 키와 1:1 정합(D16 점검 완료).
 */
const CATEGORY_ACCENT_CLASSES: Record<CategorySlug, string> = {
  animals: 'bg-accent-green',
  family: 'bg-accent-pink',
  abc: 'bg-tertiary',
  numbers: 'bg-accent-sky',
  emotions: 'bg-accent-pink',
  nature: 'bg-accent-green',
  food: 'bg-accent-yellow',
  bedtime: 'bg-accent-violet',
};

export function CategoryGrid({ categories, copy }: CategoryGridProps) {
  return (
    <section
      aria-label={copy.title}
      className="flex flex-col gap-3 rounded-md bg-surface p-5 shadow-elev-1"
    >
      <h2 className="font-display text-base font-semibold text-text">{copy.title}</h2>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {categories.map((category) => {
          const accentClass = CATEGORY_ACCENT_CLASSES[category.slug];
          return (
            <li key={category.slug}>
              <Link
                href={`/home?cat=${category.slug}`}
                className="group flex flex-col gap-2 rounded-md border border-outline bg-surface p-3 shadow-elev-1 outline-none transition-transform duration-200 ease-kiki hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <span
                  aria-hidden="true"
                  className={`block h-14 w-full rounded-sm ${accentClass}`}
                />
                <span className="text-sm font-semibold text-text">
                  {category.labelKo}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
