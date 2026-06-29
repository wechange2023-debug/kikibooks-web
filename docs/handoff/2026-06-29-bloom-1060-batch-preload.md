# 핸드오프 — Bloom L1·L2 1,060권 배치 (적재 직전)

**날짜** 2026-06-29 · **HEAD** `a7225eb` · 워킹트리 clean(`.claude/settings.local.json`만 미스테이징, 손대지 말 것) · origin 동기화

---

## 현재 지점

- **Bloom L1·L2 1,060권 배치 진행 중 — 적재 직전 단계에서 멈춤.**
- **DB 미반영(실적재 전혀 안 함).** 기존 books bloom = **50건**(활성 27 / 비활성 23) 그대로.
- 다음 결정(아래 ★)이 나오기 전까지 `--commit` 실행 금지.

## 완료된 것

- **ADR-0029(엔티티 디코딩)**: 코드(`sync_asb`·`sync_bloom`·`sync_book_dash_v2` ingestion `html.unescape`) + 문서 완료.
  DB 기존 오염 3건 정리 완료(remaining_entities=0).
- **ADR-0030(배치정책)**: Accepted. 제목/규모 = "Bloom L1·L2 1,060권"(파일명은 `0030-bloom-700-...` 유지).
  D5(source_id dedup) 추기 완료.
- **`sync_bloom.py`** — 전부 적용·검증·push 완료:
  - D1: `_NONSTORY_TOPIC_TAGS` = {Math, Mathematics, Dictionary} (Science 제거·Dictionary 추가). **검수 플래그**(자동제외 아님).
  - D2: 고해상도 표지 이식 — 첫 페이지 본문 이미지 `base + quote(unquote(filename))`(이중인코딩 방지), prefix는 `harvest_bloomdigital_base`(source_id 아님), 폴백=coverImage200.
  - D3: `level` = computedLevel 1:1(없으면 NULL).
  - D5: `dedup_latest_by_source_id` — 동일 source_id는 `createdAt` 최신 1건(tiebreak objectId).
  - **source_id 가드**: 기존 bloom source_id는 fetch 전 skip(기존 50건 미터치).
  - **REPORT/`--commit` 게이트**: 기본 REPORT(쓰기 0), `--execute --commit`만 실적재. `is_active=False` 하드코딩 불변.
- 전량 dry-run 게이트 통과(하드게이트 5종 — NC/ND·엔티티·attribution빈값·cover빈값·이중인코딩 전부 0).
- 1차 REPORT 실측 완료(아래).

## 1차 REPORT 실측 정본 (`scratchpad/bloom_742_report_actual.md`)

> 실행: `python scripts/sync_bloom.py --execute --limit 1100` (쓰기 0). 기존 source_id는 실 DB SELECT.

- **existing_ids = 50**(정본, 팀장 SQL과 일치) / **source_id 가드 skip = 50** / **INSERT = 281**.
- INSERT 281 전건: **level 부여(NULL 0)**, **표지 폴백 0**, **NC/ND 0**.
- level 분포: **L1=137 / L2=144**.
- 펀넬: 1,060 → tag dedup 897 → 영어필터 810 → D5 −7 → 803 → 스킵 522 → **INSERT 281**.

## ★ 내일 첫 결정 — 미해결

- **title-dedup2가 411권을 "기존 books 943 title과 일치"로 추가 제외** → INSERT가 692(투영)→**281**로 축소.
- **쟁점**: dedup2는 **title 기반**이라 false-positive(제목만 같은 다른 책) 누락 가능.
- **오케스트레이터 추천**: 411권 **표본 점검으로 false-positive 비율 먼저 측정** → 적재규모 결정.
  - **대안 A)** dedup2 끄고 ~692 전량 staging(사람이 검수로 거름).
  - **대안 B)** 현 설정대로 281만 적재(보수적, 단 누락 영구화 위험).
- **결정 전제**: 어차피 전건 `is_active=false` staging → 검수 단계가 뒤에 있음.

## 재개 직후 할 일

1. `git status`로 **HEAD=a7225eb · clean** 확인.
2. 위 **411권 표본 점검 작업지시서**부터 진행(오케스트레이터가 발행 예정).

## 적재 실행 방법 메모 (★ 아직 실행 금지)

- 1차 REPORT(쓰기 0): `python scripts/sync_bloom.py --execute --limit 1100`
- 2차 실적재: 위 명령에 **`--commit`** 추가 → 신규만 `is_active=false` INSERT.
- 적재 후 공개 전환: **팀장 SQL이 신규 source_id만 `is_active=true`**(기존 50건 미터치).
  비활성 23건까지 공개하는 "bloom 비활성 전체 공개"는 금지.

## 참고 산출물 (scratchpad)

- `bloom_742_report_actual.md` — 1차 REPORT 실측(정본).
- `bloom_742_preload_report.md` — 코드 가드 + 투영(692, dedup2 미반영 과대추정).
- `bloom_742_load_plan.md` — upsert 동작 분석 + 적재 2안 + 팀장 SQL.
- `bloom_742_source_ids.txt` — 배치 742 distinct source_id(팀장 SQL 대조용).
- `bloom_1060_dryrun.md` / `.json` — 전량 dry-run 게이트.
- `bloom_exclusion_signals.md` — 자동제외 신호 정찰(42권).

## 환경 메모

- `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`·`SUPABASE_SECRET_KEY` 존재 → REPORT 모드 실행 가능(읽기 전용).
- gh 활성 계정이 종종 `bigwavecto`로 바뀜 → push 전 `gh auth switch --user crspiegel` 확인.
