import type { StreakDay } from '@/lib/home/streak';
import type { HomeCopy } from '@/lib/home/copy';

/**
 * 최근 7일 학습 스트릭 막대그래프.
 *
 * 책임: lib/home/streak.ts가 반환한 7일 데이터를 design-system §7.4 토큰에
 * 1:1 매핑하여 시각화한다.
 *
 * 디자인 인용 (design-system.md §7.4):
 *   - 막대 너비 28px = w-7
 *   - 막대 최대 높이 60px = max-h-[60px] (D15 임의 픽셀 허용 1건)
 *   - 막대 radius = rounded-t-sm (위쪽만, 12px)
 *   - 완료일 색상 = bg-primary
 *   - 미완료일 색상 = bg-surface-3 (트랙 색)
 *   - 오늘 표시 = 막대 위 작은 dot, bg-accent-yellow
 *   - 막대 간 간격 = gap-2 (8px)
 *   - 요일 라벨 = caption (12px), text-text-variant
 *
 * D15 (cp3_decisions): SVG 없이 div + Tailwind 클래스로 구현.
 *
 * D17 (cp3_decisions): 막대 높이 공식 = Math.min(completedCount * 12, 60) px.
 *   - 완독 1권 = 12px
 *   - 완독 5권 = 60px (상한 도달, max-h-[60px]와 정합)
 *   - completedCount === 0 → 막대 0px (트랙만 표시)
 *
 * 빈 상태 폴백 (intent §5.5): 7일 전체 완독 0건이면 차트 아래에
 * "오늘부터 시작해볼까요?" 카드 1장 표시.
 *
 * 요일 라벨: StreakDay.date('YYYY-MM-DD')에서 JavaScript Date로 파싱하여
 * ko-KR 짧은 요일(예: '월') 추출. Date 파싱은 UTC로 해석되지만 일자만 사용하므로
 * 시간대 무관(Asia/Seoul 기준 일자가 이미 streak.ts에서 박제됨).
 *
 * Server Component — 정적 렌더, 핸들러 없음.
 */

interface StreakChartProps {
  days: StreakDay[];
  copy: HomeCopy['streak'];
}

const MAX_BAR_HEIGHT_PX = 60;
const BAR_HEIGHT_PER_BOOK_PX = 12;

/** 'YYYY-MM-DD' → ko-KR 짧은 요일('월'·'화'·…·'일'). */
function getWeekdayLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00+09:00`);
  return new Intl.DateTimeFormat('ko-KR', {
    weekday: 'short',
    timeZone: 'Asia/Seoul',
  }).format(date);
}

/** D17 공식. */
function computeBarHeight(completedCount: number): number {
  return Math.min(completedCount * BAR_HEIGHT_PER_BOOK_PX, MAX_BAR_HEIGHT_PX);
}

export function StreakChart({ days, copy }: StreakChartProps) {
  const isEmpty = days.every((d) => d.completedCount === 0);

  return (
    <section
      aria-label={copy.title}
      className="flex flex-col gap-3 rounded-md bg-surface p-5 shadow-elev-1"
    >
      <h2 className="font-display text-base font-semibold text-text">{copy.title}</h2>

      {/* 막대 7개 + 요일 라벨 */}
      <div className="flex items-end justify-between gap-2">
        {days.map((day) => {
          const barHeight = computeBarHeight(day.completedCount);
          return (
            <div key={day.date} className="flex flex-col items-center gap-1">
              {/* 오늘 dot — 막대 위에 표시. 자리 차지 일관성을 위해 항상 8px 공간 */}
              <div className="flex h-2 w-2 items-center justify-center">
                {day.isToday && (
                  <span
                    aria-hidden="true"
                    className="block h-2 w-2 rounded-full bg-accent-yellow"
                  />
                )}
              </div>

              {/* 트랙(미완료 회색 배경) + 막대(완독 비율) */}
              <div className="relative flex h-[60px] w-7 items-end overflow-hidden rounded-t-sm bg-surface-3">
                <div
                  aria-hidden="true"
                  className="w-full rounded-t-sm bg-primary"
                  style={{ height: `${barHeight}px` }}
                />
              </div>

              <span className="text-xs font-medium text-text-variant">
                {getWeekdayLabel(day.date)}
              </span>

              {/* 스크린리더 — 일자·완독 권수 명시 */}
              <span className="sr-only">
                {day.date}: {day.completedCount}권 완독
                {day.isToday ? ' (오늘)' : ''}
              </span>
            </div>
          );
        })}
      </div>

      {/* 빈 상태 폴백 */}
      {isEmpty && (
        <p className="rounded-md border border-outline bg-surface-2 px-4 py-3 text-sm text-text-variant">
          {copy.empty}
        </p>
      )}
    </section>
  );
}
