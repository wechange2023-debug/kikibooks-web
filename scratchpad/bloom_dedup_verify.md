# ADR-0030 D5 — 배치 내 source_id 중복 dedup 검증

> 작성 2026-06-29 · HEAD(적용 전) 08d4801 · `sync_bloom.dedup_latest_by_source_id` 실측 검증.
> 대상: 전량 dry-run에서 발견된 중복 6쌍(12 Parse 레코드). DB write 없음.
> 하네스(임시): temp `verify_dedup.py`·`probe_dups.py` — 커밋 미포함.

## 1. 판정 필드 선정 (6쌍 12레코드 실측)

| 후보 필드 | 결측 | 판별력 | 채택 |
|---|---|---|---|
| `createdAt` | 없음(6/6) | 6쌍 전수 유의미하게 갈림, lastUploaded와 100% 일치 | ✅ **1차** |
| `objectId` | 없음 | 동률 tiebreak(결정적) | ✅ **2차** |
| `lastUploaded` | 1쌍 양쪽 null(`03e2da8f`) | 있을 때만 createdAt과 일치 | ❌ 결측 |
| `updatedAt` | 없음 | 초 미만 차·하우스키핑, 1쌍(`b8b72cfb`) createdAt과 역전 | ❌ 비신뢰 |
| `harvestStartTime` | 전건 null | — | ❌ 미사용 |
| `version` | 전건 null | — | ❌ 미사용 |

→ **1차 createdAt 최신, 동률 시 objectId 사전순.**

## 2. 코드 변경 (`sync_bloom.py`, D1·D2·D3 무변경)

| 변경 | 내용 |
|---|---|
| `FETCH_KEYS` | `createdAt` 추가(dedup 키) |
| `dedup_latest_by_source_id` (신규) | source_id별 `(createdAt, objectId)` 최댓값 1건 유지, 첫 등장 순서 보존 |
| `run_execute` | 영어필터 직후·upsert 루프 전에 dedup 호출 + 제거 건수 로깅 |

## 3. 검증 결과 (실제 6쌍)

```
fetched 12 records for 6 dup source_ids
kept 6 (removed 6) | distinct sids = 6
  b30c4a5a survivor=4rhdAHEH7f expect=4rhdAHEH7f [OK]
  fc3c3c3f survivor=HvWwJYX64B expect=HvWwJYX64B [OK]
  b8b72cfb survivor=hKvaEUjJby expect=hKvaEUjJby [OK]
  6130da01 survivor=PszTBsGCsG expect=PszTBsGCsG [OK]
  37029e41 survivor=TVZrgv19gy expect=TVZrgv19gy [OK]
  03e2da8f survivor=ZJafHFAI5s expect=ZJafHFAI5s [OK]
determinism (orig==reversed==rotated): True
RESULT: pairs→1each=True | survivors_correct=True | deterministic=True → PASS
```

| 검증 항목 | 결과 |
|---|---|
| 6쌍 → 각 1건(removed=6) | ✅ |
| distinct source_id == 행수 | ✅ (6==6) |
| 생존 판본 = createdAt 최신 | ✅ 6/6 |
| 결정성(원본=역순=회전 입력) | ✅ |

## 4. 결론

- 배치 내 source_id 중복 6건이 **createdAt 최신 1건**으로 결정적 축약 → upsert 비결정성 제거.
- 전량 효과: dry-run 748행(distinct 742) → dedup 후 **742행 = distinct 742**(중복 0).
- D1·D2·D3 로직 무변경, dedup 단계만 삽입.

## 제약 준수
- DB 접근/실적재 없음. `sync_bloom.py` 외 코드 무변경. 판정 필드는 6쌍 실측으로만 단정.
