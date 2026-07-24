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

/**
 * 제자리 탭 최대 이동(px) — 그림 탭으로 재생/정지를 판정하는 상한(피드백 v2 Task 1.5).
 *
 * 가로·세로 이동이 모두 이 값 미만이면 '제자리 짧은 탭'으로 보고 재생/정지를 토글한다.
 * SWIPE_MIN_PX(50)보다 넉넉히 작게 둬(기본 10px) 스와이프와 구간이 겹치지 않게 한다 —
 * 10~50px의 애매한 이동은 탭도 스와이프도 아니어서 아무 동작을 하지 않는다(오발동 방지).
 */
export const TAP_MAX_PX = 10;

/**
 * 책넘김 2단계 플립 길이(ms) — 1단계(현재 장 0°→90° 접힘) + 2단계(다음 장 90°→0° 안착).
 *
 * 이 값은 **입력 잠금 시간이기도 하다**: 애니메이션이 도는 동안 사용자 조작(버튼·스와이프·탭)은
 * 무시된다(연타로 두 장이 한꺼번에 넘어가는 것 방지). 자동 넘김·무음면 넘김은 잠금 대상이
 * 아니다 — 연속 듣기 흐름이 잠금에 걸려 멈추면 안 되기 때문이다.
 * 2단계 플립은 종이가 서는 중간 자세를 확실히 보여줘야 해 600~700ms가 적정(기본 650ms).
 */
export const PAGE_TURN_MS = 650;

/**
 * 책넘김 효과음 경로 — public/sounds/page-turn.mp3.
 *
 * 자산: dragon-studio-flipping-book-page-499646 (Pixabay Content License, 2026-07-24 오케 승인).
 * 출처·라이선스는 docs/assets/audio-credits.md에 기록. 플립 1단계 시작 시점에 1회 재생된다.
 */
export const PAGE_TURN_SOUND_URL: string | null = '/sounds/page-turn.mp3';

/**
 * 책넘김 효과음 음량(0~1) — 낭독을 덮지 않도록 충분히 낮춘다.
 * 0.25 ≈ -12dB. TTS 낭독과 겹쳐도 배경에 깔리는 정도를 의도한 값이다.
 */
export const PAGE_TURN_SOUND_VOLUME = 0.25;
