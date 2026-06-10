import type { StreakDay } from '@/lib/home/streak';
import type { HomeCopy } from '@/lib/home/copy';
import { cn } from '@/lib/utils';

/**
 * 이번 주(월~일 고정) 학습 스트릭 막대그래프.
 *
 * 책임: lib/home/streak.ts가 반환한 7일(월→일) 데이터를 design-system §7.4 토큰에
 * 매핑하여 시각화한다. 데이터 배열 순서가 곧 월~일 고정 순서다.
 *
 * 디자인 인용 (design-system.md §7.4):
 *   - 막대 너비 28px = w-7 / 최대 높이 60px / radius = rounded-t-sm(위쪽만)
 *   - 완료일 색상 = bg-primary / 미완료일(트랙) = bg-surface-3
 *   - 막대 간 간격 = gap-2 / 요일 라벨 = caption(12px)
 *
 * PM 결정(2026-06-10) 반영:
 *   - 월~일 고정 정렬(streak.ts가 보장) — 오늘 기준 회전 제거.
 *   - 오늘 강조: 트랙 ring-accent-yellow + 요일 라벨/권수 숫자 primary·bold
 *     (기존 dot을 ring 하이라이트로 강화).
 *   - 각 막대 위에 완독 권수 숫자 표기. 미래 요일(isFuture)은 칸을 흐림(opacity-40)
 *     처리하고 숫자 미표시.
 *   - 독서 시간 표시 없음(과대측정 위험으로 PM 제외).
 *
 * D17 막대 높이 공식 = Math.min(completedCount * 12, 60)px (완독 1권=12px, 5권=60px 상한).
 *
 * 빈 상태 폴백 (intent §5.5): 이번 주 완독 0건이면 차트 아래 안내 카드 1장 표시.
 *
 * 요일 라벨: StreakDay.date('YYYY-MM-DD')를 Asia/Seoul 기준 ko-KR 짧은 요일로 변환.
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

      {/* 막대 7개(월→일) + 권수 숫자 + 요일 라벨 */}
      <div className="flex items-end justify-between gap-2">
        {days.map((day) => {
          const barHeight = computeBarHeight(day.completedCount);
          return (
            <div
              key={day.date}
              className={cn(
                'flex flex-col items-center gap-1',
                day.isFuture && 'opacity-40',
              )}
            >
              {/* 완독 권수 숫자 — 미래 요일은 숨김(공간은 유지). */}
              <span
                aria-hidden="true"
                className={cn(
                  'h-4 text-xs font-semibold leading-4 tabular-nums',
                  day.isToday ? 'text-primary' : 'text-text-variant',
                )}
              >
                {day.isFuture ? '' : day.completedCount}
              </span>

              {/* 트랙(미완료 회색) + 막대(완독). 오늘은 ring으로 강조. */}
              <div
                className={cn(
                  'relative flex h-[60px] w-7 items-end overflow-hidden rounded-t-sm bg-surface-3',
                  day.isToday && 'ring-2 ring-accent-yellow',
                )}
              >
                <div
                  aria-hidden="true"
                  className="w-full rounded-t-sm bg-primary"
                  style={{ height: `${barHeight}px` }}
                />
              </div>

              {/* 요일 라벨 — 오늘 강조(bold primary). */}
              <span
                className={cn(
                  'text-xs',
                  day.isToday
                    ? 'font-bold text-primary'
                    : 'font-medium text-text-variant',
                )}
              >
                {getWeekdayLabel(day.date)}
              </span>

              {/* 스크린리더 — 일자·완독 권수·상태 명시 */}
              <span className="sr-only">
                {day.date}:{' '}
                {day.isFuture ? '예정' : `${day.completedCount}권 완독`}
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
