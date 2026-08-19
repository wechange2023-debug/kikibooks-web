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
    <section className="bg-bg px-4 pt-6 md:px-6">
      {/*
        §6.4 풀폭 히어로 — radius xl(36px) + primary 채움 + text-inverse.
        대비: text-inverse/primary 9.98:1 · primary-container/primary 8.22:1 (§1.9).
      */}
      <div className="mx-auto max-w-6xl rounded-xl bg-primary px-6 py-10 shadow-elev-2 md:px-12 md:py-14">
        <div className="flex flex-col items-center gap-10 md:flex-row md:gap-12">
          <div className="flex flex-col items-center gap-4 text-center md:flex-1 md:items-start md:text-left">
            <h1 className="font-display text-h1 leading-tight text-text-inverse break-keep sm:text-display">
              {copy.title}
            </h1>
            <p className="max-w-md text-body text-primary-container break-keep sm:text-h3">
              {copy.subtitle}
            </p>
            {/* 랜딩의 유일한 CTA — 헤더 "회원가입"은 Primary 유지(§6.1 화면당 1개). */}
            <Button asChild variant="cta" size="lg" className="mt-2">
              <Link href="/signup">{copy.ctaLabel}</Link>
            </Button>
          </div>
          <div className="w-full md:flex-1" aria-hidden="true">
            {/*
              장식 블록은 흰 패널 위에 올린다 — 딥 그린 히어로 바탕에 직접 두면
              level-1(초록)이 배경에 묻힌다. 블록 색 자체는 큐 D-3 승인값 그대로다.
            */}
            <div className="mx-auto w-full max-w-sm rounded-lg bg-surface p-4">
              <div className="grid grid-cols-3 gap-3">
                {HERO_BLOCK_COLORS.map((color) => (
                  <div
                    key={color}
                    className={`aspect-[3/4] rounded-sm shadow-elev-1 ${color}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
