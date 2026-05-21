import type { ActiveChild } from '@/lib/home/active-child';
import type { GreetingData } from '@/lib/home/greeting';

/**
 * 홈 인사 카드 — 메인 카피 + 서브 카피 + 자녀 프로필 칩.
 *
 * 책임: lib/home/greeting.ts의 buildGreeting() 결과를 표시하고, 활성 자녀의
 * 이름·레벨을 칩으로 함께 노출한다.
 *
 * 디자인 인용:
 *   - design-system §6.2 정보 카드 — shadow-elev-1 + rounded-md
 *   - design-system §3 Chip — h-[38px] + px-4 + rounded-pill (자녀 프로필 칩)
 *   - design-system §1.8 자녀 레벨 매핑 — Level 1~5 → bg-level-1~5 정적 매핑
 *   - design-system §2.2 타입 스케일 — 메인 카피는 display + 18~20px Semibold
 *
 * NULL 폴백은 buildGreeting()이 이미 처리(cp1_decisions d1). 본 컴포넌트는
 * GreetingData.primary 문자열을 그대로 표시한다.
 *
 * 동적 클래스 회피 (D11 패턴): 레벨별 클래스는 LEVEL_SWATCH_CLASSES
 * 정적 매핑으로 박제 — Tailwind content 스캐너 인식 보장.
 *
 * Server Component — 정적 렌더, 핸들러 없음.
 */

interface GreetingCardProps {
  greeting: GreetingData;
  child: ActiveChild;
}

/** Level 1~5 → Tailwind 클래스 정적 매핑 (design-system §1.8). */
const LEVEL_SWATCH_CLASSES: Record<number, string> = {
  1: 'bg-level-1',
  2: 'bg-level-2',
  3: 'bg-level-3',
  4: 'bg-level-4',
  5: 'bg-level-5',
};

/** child.age는 NULL 가능 — 표시할 때만 사용. */
function formatChildLabel(child: ActiveChild): string {
  const ageLabel = typeof child.age === 'number' ? `만 ${child.age}세` : '';
  const parts = [child.name, ageLabel, `Lv.${child.current_level}`].filter(
    (part) => part.length > 0,
  );
  return parts.join(' · ');
}

export function GreetingCard({ greeting, child }: GreetingCardProps) {
  const swatchClass = LEVEL_SWATCH_CLASSES[child.current_level] ?? 'bg-surface-3';

  return (
    <section
      aria-label="인사"
      className="flex flex-col gap-3 rounded-md bg-surface p-5 shadow-elev-1"
    >
      <div className="flex flex-col gap-1">
        <p className="font-display text-lg font-semibold text-text">{greeting.primary}</p>
        <p className="text-sm text-text-variant">{greeting.subtitle}</p>
      </div>

      {/* 자녀 프로필 칩 — §3 Chip 토큰 */}
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-text ${swatchClass}`}
        >
          {[...child.name][0] ?? '?'}
        </span>
        <span className="inline-flex h-[38px] items-center rounded-pill border border-outline bg-surface-2 px-4 text-sm font-medium text-text">
          {formatChildLabel(child)}
        </span>
      </div>
    </section>
  );
}
