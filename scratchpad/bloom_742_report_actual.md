# Bloom 742 — 1차 REPORT 실측 (쓰기 0, --commit 없음)

> 실행 2026-06-29 · HEAD=78dc45b · `python scripts/sync_bloom.py --execute --limit 1100`
> **REPORT 모드(쓰기 없음)** — Storage·DB 무변경. 기존 bloom source_id는 **실 DB SELECT(정본)**.
> 원본 로그: `scratchpad/bloom_742_report_run.log`.

## ★ 핵심: 실제 INSERT = **281권** (투영 692와 큰 차이)

투영(692)은 source_id 중복(50)만 제외했으나, **실 run은 title 기반 dedup2가 기존 943개
title과 대조해 411건을 추가 제외**한다. 이 411이 692→281 격차의 주원인이다.

## 1. 펀넬 실측 vs 투영

| 단계 | 실측 | 투영 | 비고 |
|---|---|---|---|
| build_where (En+cc-by+L1\|L2) | 1,060 | 1,060 | 일치 |
| → tag dedup | 897 | 897 | 일치 |
| → 영어필터 | 810 | 810 | 일치 |
| → D5 source_id 중복제거 | **−7 → 803** | (−6) | 후보단계 중복쌍 7(ok단계 6보다 1↑) |
| 기존 books title 로드 | **943** | — | 전 플랫폼 누적(Book Dash·ASb·GDL·Bloom27 등) |
| 기존 bloom source_id(보호) | **50** | 50(근사) | **실측 정본 — 근사와 일치** |
| **INSERT 예정(신규)** | **281** | 692 | ★ 411 title 충돌 추가 제외 |

## 2. 스킵 사유별 (803 후보 → INSERT 281)

| 사유 | 건수 |
|---|---|
| **dedup2:기존제목** | **411** |
| 기존source_id(보호·미터치) | 50 |
| 합성:fetch실패 | 15 |
| 자동제외:AI생성 | 11 |
| 자동제외:테스트물 | 9 |
| 합성:이미지0장 | 9 |
| gate②:무텍스트 | 9 |
| gate①:1p이하 | 7 |
| 합성:라이선스 | 1 |
| **스킵 합계** | **522** |
| **INSERT (803−522)** | **281** ✅ |

## 3. INSERT 대상(281) 게이트 지표

| 항목 | 실측 | 판정 |
|---|---|---|
| 기존 bloom source_id(보호) | 50 | — |
| source_id 가드 skip(기존 미터치) | **50** | ✅ 기존 50건 전부 보호 |
| INSERT level 분포 | **L1=137 · L2=144 · NULL=0** | ✅ 전건 부여 |
| INSERT 표지 폴백 | **0** | ✅ |
| 검수리스트 플래그 포함 | 37 | 적재 후 인앱검수 대상(자동제외 아님) |
| license NC/ND | 0(합성:라이선스 1건은 사전 제외) | ✅ |

## 4. 해석·주의

- **existing_ids=50 정본 확인**: 실 DB의 bloom 행이 정확히 50건(STEP26 batch). source_id 가드가
  50건 전부 skip → **기존 행 cover_url·is_active 미터치 보장**.
- **dedup2 411의 의미**: Bloom 후보의 411건이 기존 books의 정규화 title과 충돌 → 적재 제외.
  - 다수는 Book Dash·ASb 등에 **같은 책이 이미 존재**하거나 제네릭 제목 충돌로 추정.
  - 단 dedup2는 **title 기반**이라 "동일 제목·다른 책"(false-positive 제외) 가능성 존재.
    411 중 일부가 진짜 신규인데 제목만 겹쳐 누락됐을 수 있음 → **표본 검수 권고**(후속).
- **D5 −7**: 후보단계 동일 source_id 중복쌍이 7(전량 dry-run의 ok단계 6보다 1 많음 —
  한 쌍은 한 레코드가 게이트 탈락해 ok집계엔 1건만 잡혔던 케이스). createdAt 최신 1건만 유지.

## 5. 투영 오차 원인 (재발 방지 메모)

- 투영(692)은 **title dedup2를 미반영**(워커 dry-run 하네스가 DB 943 title 미조회).
  실 run은 dedup2 적용 → 411 추가 제외. **DB 대조가 필요한 수치는 실 REPORT가 정본.**

## 6. 적재 규모 결론 (팀장 판단용)

- **실적재 시 신규 ≈ 281권**(L1 137 / L2 144), is_active=false 스테이징.
- 기존 50건 미터치 보장. 표지 폴백 0, level NULL 0, NC/ND 0.
- ❓ **dedup2 411 중 false-positive(제목만 겹친 신규) 표본 검수** 여부 — 적재 규모를 더 늘릴지
  팀장 판단. 현 설정 그대로면 281 적재.

## 제약 준수
- `--commit` 미사용 — DB·Storage write 0. 코드 무변경(실행만).
- 기존 bloom source_id 50은 실 DB SELECT 정본. 기존 50건은 source_id 가드로 미터치.
- 여기서 멈춤 — 실적재는 본 REPORT 검수 후 별도 지시(`--execute --commit`).
