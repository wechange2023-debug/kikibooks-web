/**
 * 읽기 하이라이트 단위 스위치 (ADR-0052 D7).
 *
 * TTS 재생 중 자막에서 하이라이트할 단위를 결정한다.
 *   - 'word'     : speech marks의 단어 타임스탬프 기준, 활성 단어 1개만 강조(기본).
 *   - 'sentence' : 활성 단어가 속한 문장 전체를 강조.
 *
 * 7/25 하이라이트 판정에서 단어 단위 동기화가 불안정하면 **이 상수 한 곳만**
 * 'sentence'로 바꾸면 highlighted-text.tsx가 문장 단위로 전환한다(강등 대비).
 * 컴포넌트 구조·마크업은 그대로 유지되며 강조 대상 span 계산만 달라진다.
 */
export type HighlightUnit = 'word' | 'sentence';

export const HIGHLIGHT_UNIT: HighlightUnit = 'word';

/**
 * 자동 넘김 지연(ms) — 오디오 종료 후 다음 페이지로 넘기기까지 대기(P1-C).
 * 즉시 넘기면 아이가 마지막 그림·문장을 볼 틈이 없어 지연을 둔다. 리허설에서
 * 이 값만 조정하면 된다(기본 2000ms).
 */
export const AUTO_ADVANCE_DELAY_MS = 2000;
