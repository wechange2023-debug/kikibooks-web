import { BookOpen, Gift, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';

import type { LandingValueProp } from '@/lib/landing/copy';

/**
 * 랜딩 핵심 가치 4개 카드.
 *
 * 서버 컴포넌트. iconKey → 아이콘 매핑은 이 컴포넌트가 가진다 — 카피 파일
 * (lib/landing/copy.ts)은 아이콘 라이브러리에 의존하지 않는다 (ADR-0012 결정 2).
 */
interface ValuePropsProps {
  items: LandingValueProp[];
}

/** copy.ts의 iconKey('books'|'age'|'safe'|'free') → lucide 아이콘. */
const ICON_BY_KEY: Record<LandingValueProp['iconKey'], LucideIcon> = {
  books: BookOpen,
  age: Sparkles,
  safe: ShieldCheck,
  free: Gift,
};

export function ValueProps({ items }: ValuePropsProps) {
  return (
    <section className="bg-surface-2 px-5 py-12 sm:py-16">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 md:grid-cols-4">
        {items.map((item) => {
          const Icon = ICON_BY_KEY[item.iconKey];
          return (
            <div
              key={item.iconKey}
              className="flex flex-col gap-3 rounded-lg bg-surface p-5 shadow-elev-1"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary-container">
                <Icon
                  className="h-6 w-6 text-on-primary-container"
                  aria-hidden="true"
                />
              </span>
              <h3 className="font-display text-base font-semibold text-text">
                {item.title}
              </h3>
              <p className="text-sm text-text-variant">{item.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
