# 오디오 자산 출처·라이선스

리더에서 재생하는 **효과음/음원 자산**의 출처와 라이선스를 여기에 기록한다.
(TTS 낭독 음원은 별도 트랙 — `docs/sql/pilot12_danielle_load.sql` 등에서 관리)

## 라이선스 게이트 (필수)

- 효과음은 **CC0 (퍼블릭 도메인 헌정)** 음원만 사용할 수 있다.
- 출처·라이선스가 확정되지 않은 파일은 **적재 금지**. CC BY 계열도 이 용도로는 쓰지 않는다
  (짧은 UI 효과음에 어트리뷰션을 상시 노출하기 어려워 CC0로 한정).

## 자산 목록

| 용도 | 파일 경로 | 출처(URL) | 라이선스 | 확보일 | 비고 |
|---|---|---|---|---|---|
| 책넘김 효과음 | _(미확보)_ | — | CC0 필요 | — | ⏳ **팀장 확보 필요** — 아래 참조 |

## 책넘김 효과음 — 대기 상태 (2026-07-24)

- 현재 리포·로컬에 출처·라이선스가 확정된 CC0 음원이 없어 **효과음은 미적재**다.
- 코드 훅은 준비돼 있다(재생 코드 무수정으로 자산만 연결 가능):
  - 재생 경로 상수: `lib/book/highlight-config.ts`의 `PAGE_TURN_SOUND_URL` (현재 `null`)
  - 음량 상수: 같은 파일 `PAGE_TURN_SOUND_VOLUME` (`0.25` ≈ -12dB, 낭독을 덮지 않는 값)
  - 재생 트리거: `components/book/audio-reader.tsx`의 `beginTurn()` — 페이지 전환마다 1회 재생
- **연결 절차** (자산 확보 시):
  1. CC0 mp3/ogg 파일을 `public/` 아래 둔다 (예: `public/sfx/page-turn.mp3`)
  2. `PAGE_TURN_SOUND_URL`을 그 경로(예: `/sfx/page-turn.mp3`)로 바꾼다
  3. 위 표에 출처 URL·라이선스·확보일을 채운다
  4. 코드 그 외 수정 0줄 — 훅이 그대로 살아난다
- **음원 후보처(CC0)**: freesound.org(License 필터 = Creative Commons 0),
  Wikimedia Commons(Public domain), Pixabay Sound Effects 등에서 "page turn / paper flip".
  다운로드 시 **각 파일의 라이선스가 실제로 CC0인지** 개별 확인 후 표에 기록한다.
