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

/**
 * 소리 없는 페이지 자동 넘김 대기(ms) — 오디오가 없는 페이지는 재생 종료 이벤트
 * (onEnded)가 없어 자동 넘김이 걸리지 않는다(Wave 1.5 F5-a). 자동 넘김 ON일 때
 * 이 시간만큼 그림을 보여준 뒤 다음 장으로 넘긴다. 소리 있는 페이지의 낭독 길이를
 * 대략 대신하는 값이라 AUTO_ADVANCE_DELAY_MS(종료 후 여운)보다 길게 둔다(기본 5000ms).
 */
export const SILENT_PAGE_ADVANCE_MS = 5000;

/**
 * 스와이프 넘김 최소 가로 이동(px) — 터치 기기 전용(Wave 2 F7).
 *
 * 이 값 미만이거나 세로 이동이 더 크면 페이지를 넘기지 않는다. 탭·세로 제스처를
 * 넘김으로 오인하지 않게 하는 유일한 문턱이라, 아이 손가락처럼 흔들림이 큰 입력에서
 * 오작동이 잦으면 이 값만 올리면 된다(기본 50px).
 */
export const SWIPE_MIN_PX = 50;
