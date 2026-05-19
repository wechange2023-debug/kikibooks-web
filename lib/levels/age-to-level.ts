/**
 * 나이 → 추천 레벨 매핑 (children 온보딩용).
 *
 * 단일 출처: docs/adr/0011-onboarding-flow.md §3 매핑표.
 *   3세→L1, 4세→L2, 5세→L3, 6세→L4, 7세→L5
 *   (phase-05 scripts/lib/level_estimator.py의 LEVEL_TABLE age_min 역인덱스)
 *
 * ★ ADR-0011 §3이 레벨↔나이의 정본이다. level_estimator.py의 LEVEL_TABLE이
 *   바뀌면 ADR-0011 §3 표와 이 파일을 함께 갱신한다 (ADR-0011 §7 재검토 트리거).
 *
 * 순수 함수 — 서버(서버 액션)와 클라이언트(입력 폼의 실시간 추천) 양쪽에서
 * 쓰므로 'server-only'를 붙이지 않는다.
 */

/** children.current_level CHECK 제약과 동일 범위 (1~5). */
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;

/** children.age CHECK 제약과 동일 범위 (만 3~7세). */
export const MIN_AGE = 3;
export const MAX_AGE = 7;

export type ChildLevel = 1 | 2 | 3 | 4 | 5;

/** ADR-0011 §3 매핑표 — 만 3~7세 각 나이의 추천 레벨. */
const AGE_TO_LEVEL: Record<number, ChildLevel> = {
  3: 1,
  4: 2,
  5: 3,
  6: 4,
  7: 5,
};

/**
 * 자녀 나이로 추천 레벨(1~5)을 구한다.
 *
 * 입력 범위 밖 처리 — ADR-0011 §3에 명시되지 않은 부분으로 CP2에서 정한 규칙:
 *  - null·undefined·비유한수(NaN·Infinity) → MIN_LEVEL(1) 기본값
 *  - 만 3세 미만 → L1로 클램프
 *  - 만 7세 초과 → L5로 클램프
 *  - 정수가 아니면 반올림 후 매핑
 *
 * 결과는 항상 1~5 범위를 만족한다 (children.current_level CHECK 제약 충족).
 * 추천일 뿐이며 학부모가 수동으로 바꿀 수 있다 (ADR-0011 결정 3).
 */
export function ageToRecommendedLevel(
  age: number | null | undefined,
): ChildLevel {
  if (age == null || !Number.isFinite(age)) {
    return MIN_LEVEL;
  }
  const clampedAge = Math.min(MAX_AGE, Math.max(MIN_AGE, Math.round(age)));
  return AGE_TO_LEVEL[clampedAge];
}
