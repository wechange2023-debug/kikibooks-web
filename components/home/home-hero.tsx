import Link from 'next/link';

import { HeroCoverStack } from '@/components/home/hero-cover-stack';
import { LIBRARY_PATH } from '@/lib/auth/routes';
import type { ActiveChild } from '@/lib/home/active-child';
import type { GreetingData } from '@/lib/home/greeting';
import type { PopularBook } from '@/lib/landing/popular-books';

/**
 * 홈 풀폭 히어로 — 인사 카피 + 자녀 프로필 칩 + CTA 1개.
 *
 * v1의 `components/home/greeting-card.tsx`(rounded-md 흰 카드)를 대체한다.
 *
 * 디자인 인용 (design-system v2 §6.4 "풀폭 히어로"):
 *   - 뷰포트 폭 전체, radius `xl`(36px), 좌우 px-4(모바일)/px-6(데스크탑) 안쪽 여백
 *   - 배경은 `primary` 채움, 위 텍스트는 `text-inverse`
 *   - **CTA 버튼 1개를 포함한다** — /home의 유일한 CTA다(§6.1 "화면당 1개")
 *
 * 대비 (§1.9 · §0 원칙 5):
 *   - text-inverse #FFFFFF / primary #1F4A3D          = 9.98:1 ✅
 *   - primary-container #DCEDE6 / primary #1F4A3D     = 8.22:1 ✅ (서브 카피)
 *   - text #1A1D1B / level-N-container                = 13.3~14.5:1 ✅ (프로필 칩)
 *   - on-cta #FFFFFF / cta #CE3D1A                    = 4.88:1 ✅
 *
 * ★ 레벨 칩 대비 교정: v1 greeting-card는 이니셜 칩에 `text-text` + `bg-level-N`을
 *   썼는데 실측 4.05:1(level-1)·3.39:1(level-5)로 **AA 미달**이었다. §1.7 규칙 1
 *   ("level-N은 스트로크·도트 전용, 텍스트 배경으로 쓰지 않는다")·규칙 2에 따라
 *   `bg-level-N-container` + `text-text` 조합으로 바꿨다.
 *
 * 동적 클래스 회피(D11 패턴): 레벨별 클래스는 정적 매핑으로 박제한다 —
 *   Tailwind content 스캐너가 문자열 조합을 인식하지 못한다.
 *
 * NULL 폴백은 buildGreeting()이 이미 처리(cp1_decisions d1).
 *
 * Server Component — 정적 렌더, 핸들러 없음.
 */

interface HomeHeroProps {
  greeting: GreetingData;
  child: ActiveChild;
  /**
   * 우측 표지 연출용 — `getRecommendations()`가 이미 가져온 배열을 그대로 받는다.
   * HeroCoverStack이 상위 3권만 쓴다. **신규 쿼리 0건**(추천 캐러셀과 같은 배열).
   */
  books: PopularBook[];
}

/** Level 1~5 → 칩 배경 정적 매핑 (design-system v2 §1.7 규칙 2). */
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

export function HomeHero({ greeting, child, books }: HomeHeroProps) {
  const chipClass = LEVEL_CHIP_CLASSES[child.current_level] ?? 'bg-surface-3';

  return (
    <section
      aria-label="인사"
      className="rounded-xl bg-primary px-6 py-8 shadow-elev-2 md:px-10 md:py-10"
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-10">
        <div className="flex flex-col gap-3">
          <p className="font-display text-h1 text-text-inverse break-keep">
            {greeting.primary}
          </p>
          <p className="text-body text-primary-container break-keep">
            {greeting.subtitle}
          </p>

          {/* 자녀 프로필 칩 — §6.5 터치 타깃 대상 아님(정보 표시) */}
          <div className="mt-1 flex items-center gap-2">
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

          {/*
            §6.4 — 히어로는 CTA 1개를 포함한다. /home의 유일한 CTA다.
            우측 표지는 콘텐츠 링크지 CTA가 아니다(§6.1 계수 대상 아님).
            h-[52px]로 §6.5 터치 타깃 하한 44px를 넘긴다 — 390px에서도 동일.
          */}
          <Link
            href={LIBRARY_PATH}
            className="mt-2 inline-flex h-[52px] w-fit items-center justify-center gap-2 rounded-pill bg-cta px-8 text-body font-semibold text-on-cta shadow-elev-cta transition-all duration-200 ease-kiki hover:-translate-y-px hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta/50 focus-visible:ring-offset-2"
          >
            책 보러 가기
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        {/*
          우측 표지 연출 — 오늘의 추천 상위 3권(신규 쿼리 0건).
          추천이 비면 HeroCoverStack이 null을 반환해 텍스트 전폭 레이아웃이 된다.
          모바일에서는 flex-col이라 텍스트 아래로 내려온다(지시 1 — 390px 재배치).
        */}
        <HeroCoverStack books={books} />
      </div>
    </section>
  );
}
