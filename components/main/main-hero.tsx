import Link from 'next/link';
import type { ReactNode } from 'react';

import { HeroCoverStack } from '@/components/home/hero-cover-stack';
import type { PopularBook } from '@/lib/landing/popular-books';

/**
 * 메인 히어로 — 좌 텍스트+CTA / 우 실표지 3장. **로그인 여부와 무관한 단일 구도.**
 *
 * ADR-0062 **Amendment 2** — v1에서는 비로그인(`landing/hero-section.tsx`)이 색 블록
 * 6장을, 로그인(`home/home-hero.tsx`)이 실표지 3장을 우측에 두어 같은 `/` 안에서
 * 히어로 인상이 갈렸다. 두 컴포넌트를 폐기하고 본 컴포넌트로 수렴한다.
 *
 * ★ **컨테이너·패널·radius·여백을 여기 한 곳이 소유한다**(A2-2).
 *   클래스를 두 곳에 두면 "두 상태가 동일한가"가 매번 검수 항목이 되지만,
 *   한 곳에 두면 **구조적으로 동일**해진다. 상태별로 바뀌는 것은 props(데이터)뿐이다.
 *
 * 디자인 인용 (design-system v2 §6.4 "풀폭 히어로"):
 *   - 뷰포트 폭 전체, radius `xl`(36px), 배경 `primary` 채움, 텍스트 `text-inverse`
 *   - **CTA 버튼 1개를 포함한다** — 그 화면의 유일한 CTA다(§6.1)
 *
 * 대비 (§1.9 · §0 원칙 5):
 *   - text-inverse #FFFFFF / primary #1F4A3D      = 9.98:1 ✅
 *   - primary-container #DCEDE6 / primary #1F4A3D = 8.22:1 ✅ (부제)
 *   - on-cta #FFFFFF / cta #CE3D1A                = 4.88:1 ✅
 *
 * 반응형: `flex-col md:flex-row` — 390px에서는 표지 스택이 텍스트·CTA 아래로 내려온다.
 * CTA는 `h-[52px]`로 §6.5 터치 타깃 하한 44px를 모든 폭에서 넘긴다.
 *
 * Server Component — 정적 렌더. 표지 폴백 상태는 자식(HeroCoverStack)이 보유한다.
 */

interface MainHeroProps {
  /** 제목 — 비로그인은 랜딩 카피, 로그인은 인사말. */
  title: string;
  /** 부제 — 비로그인은 랜딩 서브카피, 로그인은 인사 보조 문구. */
  subtitle: string;
  /** 뱃지 슬롯 — 로그인 상태의 자녀 프로필 칩. 비로그인은 생략한다. */
  badge?: ReactNode;
  ctaHref: string;
  ctaLabel: string;
  /**
   * 우측 표지 3장의 원본 배열. 상위 3권만 쓴다(HeroCoverStack이 slice).
   * 비로그인=인기 책, 로그인=오늘의 추천. **신규 쿼리 0건**(A2-4).
   */
  books: PopularBook[];
  /** 표지 링크 분기 — 로그인 `/book/[id]` · 비로그인 `/signup` (A2-3). */
  signedIn: boolean;
}

export function MainHero({
  title,
  subtitle,
  badge,
  ctaHref,
  ctaLabel,
  books,
  signedIn,
}: MainHeroProps) {
  return (
    <section
      aria-label="인사"
      className="rounded-xl bg-primary px-6 py-8 shadow-elev-2 md:px-10 md:py-10"
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-10">
        <div className="flex flex-col gap-3">
          <p className="font-display text-h1 text-text-inverse break-keep">{title}</p>
          <p className="text-body text-primary-container break-keep">{subtitle}</p>

          {badge ? <div className="mt-1">{badge}</div> : null}

          {/*
            §6.4 — 히어로는 CTA 1개를 포함한다. 그 화면의 유일한 CTA다.
            우측 표지는 콘텐츠 링크지 CTA가 아니다(§6.1 계수 대상 아님).
          */}
          <Link
            href={ctaHref}
            className="mt-2 inline-flex h-[52px] w-fit items-center justify-center gap-2 rounded-pill bg-cta px-8 text-body font-semibold text-on-cta shadow-elev-cta transition-all duration-200 ease-kiki hover:-translate-y-px hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta/50 focus-visible:ring-offset-2"
          >
            {ctaLabel}
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        {/*
          우측 표지 연출. books가 비면 HeroCoverStack이 null을 반환해
          텍스트 전폭 레이아웃이 된다(빈 크림 상자가 남지 않는다).
        */}
        <HeroCoverStack books={books} signedIn={signedIn} />
      </div>
    </section>
  );
}
