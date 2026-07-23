# 세션 재개 메모 (2026-07-23 종료 시점)

> 다음 세션 시작 시 이 파일부터 확인. 상세 계획은 `docs/intent/ux-waves-plan-vs-actual-2026-07-23.md`,
> 트래커는 `tasks/highlight-tts-plan.json`.

## 현재 지점
- HEAD = origin/main (세션 종료 시 최종 커밋). 워킹트리 clean + 의도적 untracked만(scripts/pdf_harvest·tts_pilot, scratchpad, .claude/settings.local.json).
- **UX Wave 1 · 1.5 · 1.6 · 1.7 · 1.7b** 완료·팀장 실화면 검수 통과.
- **하이라이트 판정 합격**(2026-07-23 조기 수행): 대표 3권 단어 하이라이트 OK, `HIGHLIGHT_UNIT='word'` 유지 확정(sentence 강등 불필요).
- 오디오 리더(`components/book/audio-reader.tsx`, `/book/[id]/read` 오디오 분기) = 연속 듣기 모드·무음면 카운트다운·헤더 ⓘ 어트리뷰션 팝오버·페이지 위치·하단 바 스타일까지 반영.

## 다음 안건 — Phase F 잔여
1. **카탈로그·상세 TTS 아이콘 노출** (오디오 보유 책 표시).
2. **`getBookById` `has_audio` 보강** — ⚠️ `unstable_cache('books-catalog', 1h)` 무효화 고려 필수(ADR-0033). 컬럼 추가가 카탈로그 캐시에 영향(ADR-0035 D6 참조). 현재 리더는 캐시 우회로 `book_audio` count(`hasReaderAudio`)를 봄 — 카탈로그 아이콘은 캐시 경유라 접근 다름.
3. **책 단위 서비스 ON** (12권 한정, tts_done 전이 SQL은 팀장이 SQL Editor 직접 실행).

## 이후 일정 (변경 없음)
- **7/26** Wave 머지 데드라인(미머지분 시연 범위 자동 제외)
- **7/27** 리허설 — ADR-0052 D1 **신규 기능 추가 금지**
- **7/28** 내부 시연
- 시연 후: Wave 2(스와이프·뒤로가기 보호·자막 숨김) · 디자인 리뉴얼(Epic!·Vooks·Duolingo ABC·Khan Academy Kids) · 잔여 140권 배치 · Wave 3

## 운영 규율 리마인더
- git: `git add .` 금지(파일명 명시), add→commit→push 분리, 단일 `-m`, 트레일러 0.
- push STEP 0: `gh auth status` → **crspiegel 활성** 확인(아니면 STOP). pre-push 훅 fail-closed.
- 스키마 변경은 ADR 선행. DB/Storage/AWS·Supabase secret은 워커 환경 주입 금지(팀장 직접).
- **`pnpm dev` 실행 중 `pnpm build` 금지**(`.next` 공유 충돌 — 7/23 서버 오염 원인). 코드 검증은 type-check+lint, build 필요 시 dev 정지 후.
