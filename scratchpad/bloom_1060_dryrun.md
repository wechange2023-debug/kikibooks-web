# Bloom L1·L2 전량 dry-run — 적재 전 최종 게이트 (DB 미반영)

> 작성 2026-06-29 · HEAD=5f00bc2 · ADR-0030 적용 `sync_bloom.py` 펀넬 재현(코드 무변경, 실행만).
> DB write 없음. DB 의존 단계(기존제목 dedup·Storage upload·DB upsert)는 dry-run에서 제외.
> 원본 데이터: `scratchpad/bloom_1060_dryrun.json`. 하네스(임시): temp `dryrun_1060.py`(커밋 미포함).

## 1. 대상 확정 (펀넬 실측)

| 단계 | 건수 | 비고 |
|---|---|---|
| `build_where` (En + cc-by + computedLevel∈{1,2}) | **1,060** | ADR-0030 실측(L1=487/L2=573)과 **정확히 일치** ✅ |
| → tag dedup (Book Dash·ASb 사본 제외) | 897 | −163 |
| → 영어필터(allTitles "en" 존재) | **810** | −87. 실제 적재 시도 후보 |
| → 적재가능(ok) | **748** | 게이트 통과 |
| → 스킵 | 62 | 7.7% (아래 사유별) |
| **distinct source_id(ok)** | **742** | ok 748 − 배치내 중복 6 (§4 ⚠️) |

> 1,060(raw where) ↔ 810(adapt 후보) 차이 원인 = tag dedup 163 + 영어필터 87. 신규/삭제 아님.

## 2. 스킵 사유별 집계 (62건, index.htm 3회 재시도 후)

| 사유 | 건수 | 구분 |
|---|---|---|
| 합성:fetch실패 | 15 | 네트워크/harvester index 부재(재시도 후 잔존) |
| 자동제외:AI생성 | 11 | AI 이미지/저자 |
| 자동제외:테스트물 | 9 | 제목 unit/phase/test 등 |
| 합성:이미지0장 | 9 | 본문 이미지 없음 |
| gate②:무텍스트 | 9 | 영어 텍스트 0 |
| gate①:1p이하 | 8 | 본문 1장 이하 |
| 합성:라이선스 | 1 | HTML 라이선스 검증 실패 |

## 3. 게이트 판정

| 게이트 | 실측 | 판정 |
|---|---|---|
| license NC/ND 유입 | **0** (748 전건 `cc-by-4-0`) | ✅ PASS (Hard Rule) |
| 메타 엔티티(`&...;`) | **0** (title·author·illustrator·attribution_text 전수) | ✅ PASS (ADR-0029 효과 전량 확인) |
| attribution_text 빈값 | **0** | ✅ PASS (NOT NULL) |
| cover_url 빈값 | **0** (폴백 포함 전건 확보) | ✅ PASS |
| 이중인코딩 `%2520` | **0** | ✅ PASS |
| source_id 충돌 | ⚠️ 기존 staged 50 + 배치내 중복 6 | ⚠️ §4 (upsert로 처리, 제약위반 아님) |

**핵심 5개 하드 게이트(NC/ND·엔티티·attribution·cover·이중인코딩) 전부 0 → 통과.**

## 4. source_id 충돌 상세 ⚠️ (팀장 판단)

- **기존 staged 50건**: ok 748 중 50건이 STEP26 batch-50(이미 is_active staged) source_id와 동일.
  · UNIQUE(source_platform, source_id) + **upsert on_conflict** → **신규 INSERT 아닌 UPDATE**(제약 위반 없음).
  · 즉 실제 신규 적재 ≈ 742 − 50 = **약 692권**(기존 staged 27 공개분 포함 여부는 DB 확인 필요).
  · ※ 본 충돌검사는 DB 직접 조회 불가로 **batch-50 source_ids 기준 근사**. 실제 books 테이블과의
    정확 대조는 적재 단계에서 SQL로 재확인 권장.
- **배치내 중복 source_id 6건**: 동일 `bookInstanceId`를 가진 Parse 레코드가 2개씩 존재
  (언어/판본 변종이 bookInstanceId 공유). ok 748행 → **distinct 742**.
  · upsert 시 처리 순서에 따라 후순위가 선순위를 덮어씀 → 결과 1행. 데이터 손실은 아니나
    **어느 판본이 남을지 비결정적** → 적재 코드의 순차 처리에선 마지막 처리분이 잔존.
  · 중복 sid: `b30c4a5a`(Wild Animals) 외 5건(`fc3c3c3f`, `b8b72cfb`, `6130da01`, `37029e41`, `03e2da8f`).
  · 권고: 적재 전 source_id 기준 1단 dedup 추가 검토(후속). 현 dedup2(정규화 title)가 일부 포착 가능.

## 5. 분포 (보고용)

- **level**: L1=378 · L2=370 · NULL=0 (전건 부여, L1\|L2만) ✅
- **license**: cc-by-4-0 = 748 (단일)
- **표지 해상도(width)**: min 158 / median **600** / max 1,919 / 200px이하 **1건**
  · 폴백 0건 · non-200 **0건**(전건 HTTP 200).
  · 저해상 1건: `e32ef0f4` *My Body* (첫 본문 이미지 자체가 158px, 폴백 아님). 시각검수 권고.
- **검수 플래그(_NONSTORY_TOPIC_TAGS)**: topic:Dictionary=36 · topic:Math=29
  · Science 표기 **0건**(ADR-0030 D1 제거 효과 확인). 이들은 **검수 신호일 뿐 자동제외 아님**.

## 6. 결론

- **적재 차단 사유(하드 게이트) 없음** — NC/ND·엔티티·attribution·cover·이중인코딩 전부 0.
- **표지 고해상 이식 정상**(median 600, 폴백 0, non-200 0, %2520 0). 저해상 1건만 검수 권고.
- **레벨 1:1 부여 정상**(NULL 0).
- ⚠️ **팀장 판단 2건**: (a) 기존 staged 50건 재처리(upsert-update) 허용 여부,
  (b) 배치내 중복 source_id 6건의 dedup 정책(현 upsert로 무해하나 판본 선택 비결정).
- **스킵 62/810(7.7%)**: fetch실패 15는 재시도 후 잔존 — 적재 본실행에서 재시도/재실행으로 일부 회복 가능.
- 다음 단계: 본 결과 검수 후 **적재 승인 → 실적재(별도 지시)**. 적재 시 source_id 충돌은
  DB SQL로 정확 재대조 권장.

## 제약 준수
- 읽기 전용 dry-run. DB write·실적재 없음. `sync_bloom.py` 무변경(실행만).
- 건수·분포·판정 전부 실측. 1,060은 추정 아닌 `fetch_count` 실측(=ADR 일치).
