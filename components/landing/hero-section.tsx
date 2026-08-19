import Link from 'next/link';

import { Button } from '@/components/ui/button';
import type { LandingCopy } from '@/lib/landing/copy';

/**
 * 랜딩 히어로 — 메인 카피 + 서브 카피 + 가입 CTA + 색상 블록.
 *
 * 서버 컴포넌트. 색상 블록은 외부 이미지 없이 디자인 토큰 색면으로 구성한다
 * (인수인계 D4 — 히어로 일러스트는 토큰 색상 블록). 장식 요소라 aria-hidden.
 */
interface HeroSectionProps {
  copy: LandingCopy['hero'];
}

/** 색상 블록 — design-system v2 §1.7 레벨 토큰 + §1.1 primary container. 장식(aria-hidden). */
const HERO_BLOCK_COLORS = [
  'bg-level-1',
  'bg-level-2',
  'bg-level-3',
  'bg-level-4',
  'bg-level-5',
  'bg-primary-container',
] as const;

export function HeroSection({ copy }: HeroSectionProps) {
  return (
    <section className="bg-bg px-5 py-12 sm:py-16">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-10 md:flex-row md:gap-12">
        <div className="flex flex-col items-center gap-4 text-center md:flex-1 md:items-start md:text-left">
          <h1 className="font-display text-h1 font-semibold leading-tight text-text break-keep sm:text-display">
            {copy.title}
          </h1>
          <p className="max-w-md text-body text-text-variant break-keep sm:text-h3">
            {copy.subtitle}
          </p>
          <Button asChild variant="cta" size="lg" className="mt-2">
            <Link href="/signup">{copy.ctaLabel}</Link>
          </Button>
        </div>
        <div className="w-full md:flex-1" aria-hidden="true">
          <div className="mx-auto grid w-full max-w-xs grid-cols-3 gap-3">
            {HERO_BLOCK_COLORS.map((color) => (
              <div
                key={color}
                className={`aspect-[3/4] rounded-lg shadow-elev-1 ${color}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
