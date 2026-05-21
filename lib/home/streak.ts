import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 최근 7일 학습 스트릭 — design-system.md §7.4 Streak 컴포넌트가 의존하는 데이터.
 *
 * 채움 기준: `reading_sessions.is_completed = true` (intent §5.5, design-system §7.4
 * "완료일 색상" 정의와 정합). 세션 시작만으로는 막대 채우지 않는다.
 *
 * 타임존 정책 (CP2-b batch2 자체 점검 (d)):
 *   - **Asia/Seoul 기준 일자** 채택. 사유:
 *     · 한국 사용자 — 자정 직후 완독이 "오늘"로 인식되어야 함
 *     · UTC 기준이면 한국 자정 직후(UTC 15:00)가 다음 날로 표시되어 혼란
 *   - Supabase TIMESTAMPTZ는 UTC로 저장. JS 측에서 Asia/Seoul로 변환하여 일자 그룹핑.
 *   - completed_at 필드는 NULL 가능. NULL은 그룹핑에서 제외.
 *
 * RLS 근거: 001 §9.4 "parents can view own children sessions" (자녀 행만 가시).
 *   .eq('child_id', childId)는 명시 필터로 RLS의 2차 방어선.
 *
 * 의도 문서: docs/intent/screen-02-home.md §5.5
 */

const SEOUL_TZ = 'Asia/Seoul';
const DAY_MS = 24 * 60 * 60 * 1000;

/** 스트릭 막대 1개에 필요한 데이터. */
export interface StreakDay {
  /** Asia/Seoul 기준 'YYYY-MM-DD'. */
  date: string;
  /** 해당 일자에 완독한 reading_sessions 행 수. 0 가능. */
  completedCount: number;
  /** 오늘(Asia/Seoul 기준)이면 true. design-system §7.4 dot 표시 대상. */
  isToday: boolean;
}

/** reading_sessions 완독 행 조회용. */
interface CompletedRow {
  completed_at: string;
}

/** Date를 Asia/Seoul 기준 'YYYY-MM-DD' 문자열로 변환. */
function toSeoulDateString(date: Date): string {
  // 'en-CA' locale은 'YYYY-MM-DD' ISO 형식을 보장.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date);
}

/** Asia/Seoul 기준 오늘 자정에 해당하는 UTC Date 객체를 반환. */
function getSeoulTodayStart(): Date {
  const todaySeoulDate = toSeoulDateString(new Date());
  // KST(UTC+09:00)의 자정을 ISO 문자열로 표현 → UTC로 변환된 Date
  return new Date(`${todaySeoulDate}T00:00:00+09:00`);
}

/**
 * 자녀의 최근 7일(오늘 포함, Asia/Seoul 기준) 완독 분포를 반환한다.
 *
 * 반환 배열은 항상 정확히 7개 — 가장 오래된 날(인덱스 0) → 오늘(인덱스 6).
 * 완독 0건 날도 0으로 포함된다(design-system §7.4 미완료일 막대 표시 대상).
 */
export async function getStreakLast7Days(
  supabase: SupabaseClient,
  childId: string,
): Promise<StreakDay[]> {
  const todayStart = getSeoulTodayStart();
  // 7일 = 오늘 포함 → 6일 전 자정부터
  const rangeStart = new Date(todayStart.getTime() - 6 * DAY_MS);

  const { data, error } = await supabase
    .from('reading_sessions')
    .select('completed_at')
    .eq('child_id', childId)
    .eq('is_completed', true)
    .gte('completed_at', rangeStart.toISOString())
    .not('completed_at', 'is', null)
    .returns<CompletedRow[]>();

  if (error) {
    throw new Error(`getStreakLast7Days: reading_sessions 조회 실패 — ${error.message}`);
  }

  // 일자별 완독 수 그룹핑 (Asia/Seoul 기준)
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.completed_at) {
      const seoulDate = toSeoulDateString(new Date(row.completed_at));
      counts[seoulDate] = (counts[seoulDate] ?? 0) + 1;
    }
  }

  // 7일 슬롯 생성 (오래된 날 → 오늘)
  const todayStr = toSeoulDateString(new Date());
  const result: StreakDay[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const slotDate = new Date(todayStart.getTime() - i * DAY_MS);
    const dateStr = toSeoulDateString(slotDate);
    result.push({
      date: dateStr,
      completedCount: counts[dateStr] ?? 0,
      isToday: dateStr === todayStr,
    });
  }

  return result;
}
