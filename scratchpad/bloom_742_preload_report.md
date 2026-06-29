# Bloom 742 — source_id 가드 + 적재 전 게이트 보고 (1차, 쓰기 없음)

> 작성 2026-06-29 · HEAD=d7f4613 기준 코드 변경 후 · `sync_bloom.py` 수정.
> 본 보고의 수치는 **전량 dry-run(`bloom_1060_dryrun.json`) 기반 투영**이다.
> 워커는 Supabase 미접근 → `existing_ids` 실측은 팀이 `--execute`(REPORT 모드) 실행 시 출력.

## 1. 코드 변경 (`sync_bloom.py`, ADR-0030 [A])

| 변경 | 내용 |
|---|---|
| `fetch_existing_source_ids` (신규) | `select source_id where source_platform='bloom'` — 기존 bloom source_id 집합(읽기 전용) |
| `run_execute` source_id 가드 | 루프 초입(네트워크 fetch 전): `source_id ∈ existing_ids → skip`("기존source_id(보호·미터치)"). title-dedup(L1005)과 별개의 **우선 가드** |
| `run_execute(commit=False)` | **기본 REPORT 모드** — Storage·DB 쓰기 없이 INSERT 대상 집계(건수·level·표지폴백)만 출력 후 종료 |
| `run_execute(commit=True)` | 실제 적재(`--execute --commit`). 신규만 `is_active=False`(L891 하드코딩 **불변**) |
| `--commit` 플래그 | `--execute`와 함께일 때만 실적재. 미지정 시 REPORT |
| pool 상한 | `--limit≥500`(전량 배치)은 전수 수집(pool=None) — 742가 200에서 잘리지 않도록 |

- **기존 50건은 어떤 경우에도 UPDATE/덮어쓰기 없음** — fetch 전 source_id 가드로 차단.
  is_active=False 강제 덮어쓰기로 인한 활성책 비활성화 위험 원천 제거.
- 자동 적재 금지: `--execute` 단독은 REPORT(쓰기 없음). 실적재는 `--execute --commit`(팀 승인 후).

## 2. 적재 전 게이트 수치 (dry-run 투영 — ★ 실측은 팀 REPORT 실행)

| 항목 | 투영값 | 비고 |
|---|---|---|
| 기존 bloom source_id(보호 대상) | **50**(근사) | batch-50 기준. **실측 = 팀 `--execute` REPORT의 "기존 bloom source_id N개 로드"** |
| 배치 distinct source_id | **742** | `bloom_742_source_ids.txt` |
| source_id 가드 skip(기존) | **50** | 기존 50건 미터치 |
| **INSERT 예정(신규)** | **692** | 742 − 50 |
| INSERT 대상 level 분포 | **L1=349 · L2=343 · NULL=0** | 전건 부여 |
| INSERT 대상 표지 폴백 | **0** | |
| (참고) INSERT 대상 표지 width≤200 | 1 | `My Body` 158px(폴백 아님, 시각검수 권고) |
| (참고) INSERT 대상 license≠cc-by-4-0 | 0 | NC/ND 유입 0 |

> 투영 근거: 전량 dry-run 748 ok행 → distinct 742 → batch-50 제외 692. level·표지·license는
> dry-run 실측 분포. **단 existing_ids 50은 batch-50 근사** — 실 DB의 bloom source_id 수가
> 다르면(예: 27만 적재됐다면) skip/INSERT 수가 달라진다. **팀 REPORT 실행 수치를 정본으로 한다.**

## 3. 실행 방법 (팀)

```bash
# 1차 — REPORT(쓰기 없음): existing_ids·skip·INSERT·level 분포 출력 후 종료
python scripts/sync_bloom.py --execute --limit 1100
#   → 콘솔의 "기존 bloom source_id N개", "INSERT 예정 N", level 분포 확인

# 2차 — 팀장 승인 후 실적재(신규만 is_active=false 스테이징)
python scripts/sync_bloom.py --execute --limit 1100 --commit
```
- `--limit`은 INSERT 상한. 전량(≈692)을 받으려면 692↑(여유로 1100) 지정.

## 4. 게이트 판정 (적재 진행 가부)

| 게이트 | 투영 | 판정 |
|---|---|---|
| 기존 50건 미터치(source_id 가드) | skip 50, UPDATE 0 | ✅ 보장(코드 가드) |
| INSERT 대상 NC/ND | 0 | ✅ |
| INSERT 대상 level NULL | 0 | ✅ |
| INSERT 대상 표지 폴백 | 0 | ✅ |
| is_active 신규 = false 스테이징 | 하드코딩 불변 | ✅ |

→ **여기서 멈춤(1차).** 팀이 REPORT 실행으로 위 수치(특히 existing_ids 실측)를 확인하고
"적재 진행" 지시 시 `--commit` 2차 실행.

## 5. 공개 전환 (적재 후, 팀장 SQL)

신규 source_id에만 `is_active=true`. 기존 50건(활성27/비활성23)·큐레이션 제외분 미터치
(`bloom_742_load_plan.md` §4 (c) 참조).

## 제약 준수
- `sync_bloom.py` 외 코드 무변경. `is_active` 하드코딩(False) 불변. 1차 보고까지만(자동 적재 금지).
- existing_ids·skip 수치는 dry-run 투영 — 실측은 팀 REPORT 실행. 기존 50건은 코드 가드로 미터치 보장.
