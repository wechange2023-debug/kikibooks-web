# 오디오 자산 출처·라이선스

리더에서 재생하는 **효과음/음원 자산**의 출처와 라이선스를 여기에 기록한다.
(TTS 낭독 음원은 별도 트랙 — `docs/sql/pilot12_danielle_load.sql` 등에서 관리)

## 라이선스 게이트 (필수)

- 효과음은 출처·라이선스가 **확정된** 음원만 사용한다. 확정 불가 파일은 적재 금지.
- 허용 라이선스: CC0(퍼블릭 도메인 헌정), Pixabay Content License 등 **어트리뷰션 없이
  상업적 사용·재배포가 허용되는** 라이선스. CC BY 계열(어트리뷰션 상시 노출 요구)은
  짧은 UI 효과음에 부적합해 원칙적으로 배제한다.

## 자산 목록

| 용도 | 파일 경로 | 출처(URL) | 라이선스 | 확보일 | 비고 |
|---|---|---|---|---|---|
| 책넘김 효과음 | `public/sounds/page-turn.mp3` | https://pixabay.com/sound-effects/film-special-effects-flipping-book-page-499646/ | Pixabay Content License | 2026-07-24 | 원본 파일명 `dragon-studio-flipping-book-page-499646`. 오케 승인(2026-07-24) |

## 책넘김 효과음 — 적재 완료 (2026-07-24)

- **파일**: `public/sounds/page-turn.mp3` (원본 `dragon-studio-flipping-book-page-499646.mp3`, 팀장 배치)
- **출처**: https://pixabay.com/sound-effects/film-special-effects-flipping-book-page-499646/
- **라이선스**: Pixabay Content License (어트리뷰션 불요·상업적 사용 허용). 오케 승인 2026-07-24.
- **연결**:
  - 경로 상수: `lib/book/highlight-config.ts` `PAGE_TURN_SOUND_URL = '/sounds/page-turn.mp3'`
  - 음량 상수: 같은 파일 `PAGE_TURN_SOUND_VOLUME = 0.25` (≈ -12dB, 낭독을 덮지 않는 값)
  - 재생 트리거: `components/book/audio-reader.tsx`의 `beginTurn()` — 플립 **1단계 시작 시점**에 1회 재생
- **교체 절차** (다른 음원으로 바꿀 때):
  1. 새 파일을 `public/sounds/` 아래 둔다
  2. `PAGE_TURN_SOUND_URL`을 그 경로로 바꾼다
  3. 위 표에 출처·라이선스·확보일을 갱신한다 — 코드 그 외 수정 0줄
