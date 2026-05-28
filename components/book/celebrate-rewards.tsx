'use client';

import { Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * CelebrateRewards — Screen 05 완독 보상 §7.3 모션 컴포넌트 (CP2-d).
 *
 * /book/[id]/celebrate(CP2-e)가 본인 세션으로 children.points·child_badges·book을 읽고,
 * 그 결과(pointsAwarded·badgeNewlyEarned 등)를 props로 본 컴포넌트에 주입한다. 본 컴포넌트는
 * 별 3개·포인트 카운터·완독 배지 등장 모션만 담당하고 데이터 쓰기는 0건이다(보상 적립은
 * completeReadingSession 내부의 awardCompletionRewards가 이미 완료한 상태로 도착).
 *
 * design-system §7.3 Celebrate 모션 토큰 100% 정합 (line 368~381):
 *   별 3개 등장: 0/150/300ms stagger, scale(0)→(1.2)→(1), cubic-bezier(0.34, 1.56, 0.64, 1) bounce
 *   별 채우기: 등장 후 200ms 지연 + 색상 transition 400ms (회색 → --color-accent-yellow)
 *   포인트 카운터: 0→50 count-up, 600ms ease-out
 *   포인트 카드: 별 완료 후 100ms 지연, fade-in + translateY(20px→0), 300ms
 *   배지 등장: 포인트 카드 후 200ms 지연, scale(0.5)→(1), 350ms bounce
 *   reduced-motion: prefers-reduced-motion: reduce 시 bounce → linear fade, duration 50% 축소
 *
 * keyframes 추가 0건 (tailwind.config.ts 무변경 — 자발 발견 1):
 *   ease-kiki-bounce(cubic-bezier(0.34, 1.56, 0.64, 1))가 tailwind.config.ts line 96에 §7.3용으로
 *   이미 토큰화돼 있다(주석 "7.3 Celebrate bounce"). 이 곡선의 1.56 > 1이 오버슈트를 만들어,
 *   scale-0 → scale-100 transition에 적용하면 자동으로 1.2 부근까지 튀었다 1로 안착한다.
 *   §7.3 "scale(0)→1.2→1"이 keyframes 없이 transition만으로 충족된다.
 *
 * 외부 라이브러리 0건 (PLAN 의존성 정합):
 *   count-up은 requestAnimationFrame + ease-out cubic 자체 구현. framer-motion·canvas-confetti 등
 *   외부 모션 라이브러리는 미도입(F21 confetti 결정은 CP2-e 시각 검수 시).
 *
 * Hard Rule 10 (raw HEX 0건):
 *   모든 색·간격·여백·shadow는 tailwind.config.ts 등록 semantic 토큰만 사용
 *   (text-accent-yellow·text-text-disabled·text-text-variant·text-text·bg-surface·
 *    bg-accent-yellow·shadow-elev-1·rounded-lg·rounded-pill·ease-kiki·ease-kiki-bounce).
 *   easing의 cubic-bezier(...)는 색상이 아닌 모션 곡선이라 raw HEX 규칙 대상 아님.
 *
 * props 직렬화 0 문제:
 *   page(Server Component)가 객체·문자열·숫자 props를 전달하므로 직렬화 문제 0건. function prop은
 *   받지 않는다(buildSubtitle은 page가 서버에서 평가해 결과 문자열을 page 본문에 직접 렌더).
 *
 * badgeNewlyEarned (CP2-e 결정 위임):
 *   true면 배지 등장 모션을 렌더하고, false(이미 보유 — 재독)면 배지 섹션을 미렌더한다.
 *   page(CP2-e)가 child_badges SELECT 결과로 "최초 획득 시점"을 판정해 prop으로 전달한다.
 *
 * 의도 문서: docs/intent/screen-05-celebrate.md §5.1 + §7
 * ADR: docs/adr/0018-completion-rewards-and-library.md D9
 */

interface CelebrateRewardsProps {
  /** count-up 목표값(awardCompletionRewards가 적립한 양, 보통 50). */
  pointsAwarded: number;
  /** 포인트 단위 라벨(CelebrateCopy.pointsLabel='포인트'). count-up과 조합되어 '+50 포인트'로 렌더. */
  pointsLabel: string;
  /** 완독 배지 라벨(CelebrateCopy.badgeLabel='완독 배지 획득!'). */
  badgeLabel: string;
  /** 신규 획득(true)이면 배지 모션 렌더, 이미 보유(false, 재독)면 배지 섹션 미렌더. */
  badgeNewlyEarned: boolean;
}

/** 별 3개 stagger delay (§7.3 — 0/150/300ms). */
const STAR_STAGGER_MS = [0, 150, 300] as const;
/** 마지막 별(300ms) + 등장 transition(~300ms) 종료 후 §7.3 채우기 시작 지점. */
const STARS_FILL_PHASE_MS = 600;
/** 별 채우기(400ms) + §7.3 "별 완료 후 100ms 지연" → 포인트 카드 등장 시점. */
const POINTS_PHASE_MS = 1100;
/** 포인트 카드(300ms) + §7.3 "포인트 카드 후 200ms 지연" → 배지 등장 시점. */
const BADGE_PHASE_MS = 1600;
/** §7.3 포인트 카운터 600ms ease-out. */
const COUNT_UP_DURATION_MS = 600;

/**
 * 단계 — 모션 진행 상태.
 *   0: hidden(초기, 모든 요소 미가시)
 *   1: stars appear(별 3개 stagger 등장, 회색)
 *   2: stars fill(별 회색 → accent-yellow)
 *   3: points card + count-up(0→50)
 *   4: badge reveal(badgeNewlyEarned일 때만)
 */
type Phase = 0 | 1 | 2 | 3 | 4;

export function CelebrateRewards({
  pointsAwarded,
  pointsLabel,
  badgeLabel,
  badgeNewlyEarned,
}: CelebrateRewardsProps) {
  const [phase, setPhase] = useState<Phase>(0);
  const [count, setCount] = useState(0);
  const prefersReducedRef = useRef(false);

  // mount 후 phase 타이머 체인 (또는 reduced-motion 시 즉시 최종 상태).
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedRef.current = mq.matches;

    if (mq.matches) {
      setPhase(4);
      setCount(pointsAwarded);
      return;
    }

    const timers = [
      window.setTimeout(() => setPhase(1), 0),
      window.setTimeout(() => setPhase(2), STARS_FILL_PHASE_MS),
      window.setTimeout(() => setPhase(3), POINTS_PHASE_MS),
      window.setTimeout(() => setPhase(4), BADGE_PHASE_MS),
    ];
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [pointsAwarded]);

  // count-up — phase >= 3에서 requestAnimationFrame로 ease-out cubic(1 - (1-t)^3).
  useEffect(() => {
    if (phase < 3 || prefersReducedRef.current) {
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / COUNT_UP_DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(eased * pointsAwarded));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [phase, pointsAwarded]);

  const starsVisible = phase >= 1;
  const starsFilled = phase >= 2;
  const pointsVisible = phase >= 3;
  const badgeVisible = phase >= 4 && badgeNewlyEarned;

  return (
    <div className="flex flex-col items-center gap-6">
      {/* 별 3개 stagger 등장 + 회색→accent-yellow 채우기 (§7.3) */}
      <div className="flex items-center gap-3" aria-hidden="true">
        {STAR_STAGGER_MS.map((delay, i) => (
          <Star
            key={i}
            className={`h-12 w-12 fill-current transition-all ease-kiki-bounce motion-reduce:transition-none ${
              starsVisible ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
            } ${starsFilled ? 'text-accent-yellow' : 'text-text-disabled'}`}
            style={{
              transitionDelay: `${delay}ms`,
              transitionDuration: starsFilled ? '400ms' : '300ms',
            }}
          />
        ))}
      </div>

      {/* 포인트 카드 — fade-in + translateY (§7.3), count-up 숫자 + 단위 라벨 */}
      <div
        className={`flex flex-col items-center rounded-lg bg-surface px-6 py-4 shadow-elev-1 transition-all duration-300 ease-kiki motion-reduce:transition-none ${
          pointsVisible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'
        }`}
        aria-live="polite"
      >
        <span className="font-display text-4xl font-bold text-accent-yellow tabular-nums">
          {`+${count}`}
        </span>
        <span className="text-sm font-medium text-text-variant">{pointsLabel}</span>
      </div>

      {/* 배지 — 신규 획득(badgeNewlyEarned=true) 시만 mount + scale bounce 등장 (§7.3) */}
      {badgeVisible && <BadgeReveal label={badgeLabel} />}
    </div>
  );
}

/**
 * BadgeReveal — 배지 단독 마운트 모션.
 *
 * 부모(CelebrateRewards)에서 badgeVisible=true일 때만 mount된다. mount 시 1프레임 후
 * visible state를 토글해 scale(0.5)→(1) bounce transition을 트리거한다(§7.3 350ms bounce).
 * 별처럼 stagger 분리가 필요 없어 단순 useState 패턴이면 충분하다.
 */
function BadgeReveal({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={`rounded-pill bg-accent-yellow px-5 py-2 transition-all ease-kiki-bounce motion-reduce:transition-none ${
        visible ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
      }`}
      style={{ transitionDuration: '350ms' }}
    >
      <span className="text-sm font-semibold text-text">{label}</span>
    </div>
  );
}
