# image_backfill — ASb·Bloom 669권 `book_text.image_url` 백필 실행 순서

생성: `scripts/image_backfill/build_asb_bloom_image_backfill.py` (워커, DB 접속 0건)
근거: **ADR-0057 D5-②** / 검증 기준 **D5-④** · 파서 규약 ADR-0056 D4 · ADR-0025 Amd#6 A2·A3·A4

**총 669권 / 6,780행** (african_storybook 5,211 + bloom 1,569)

## ⚠ 파일명 정렬 주의

디렉토리 목록에서 `chunk_*`가 `step*`보다 먼저 표시된다(ASCII 정렬).
**실행 순서는 아래 표를 따른다 — 목록 순서가 아니다.**

## 백필 전 기준 상태 (팀장 SQL 실측 2026-08-13)

| 항목 | 값 |
|---|---:|
| `book_text` 전체 행 | 9,496 |
| `book_text` distinct book | 860 |
| `image_url` not null (D5-① book_dash 191권 완료분) | 2,597 |
| 잔여 NULL (= ASb·Bloom 669권 6,899행) | 6,899 |

## 왜 파일이 여러 개인가

`docs/sql/load708/` 선례와 동일하다. **VALUES 적재(무거움)** 와 **본 테이블 머지(가벼움)** 를 분리했다.

- 청크 파일은 staging 테이블에만 넣는다 → 실패해도 `book_text` 무접촉
- 머지 파일은 VALUES가 없어 짧다(staging에서 SELECT) → SQL Editor 크기 제한과 무관
- 최대 파일 151,443 B — load708 실증 안전선(156,228 B) 이내

## 실행 순서

| # | 파일 | 내용 | 기대값 |
|---|---|---|---|
| 1 | `step0_staging.sql` | staging 테이블 생성 | `staging_rows` 0 |
| 2 | `chunk_01.sql` | 76권 800행 | 누적 800 |
| 3 | `chunk_02.sql` | 69권 800행 | 누적 1,600 |
| 4 | `chunk_03.sql` | 84권 800행 | 누적 2,400 |
| 5 | `chunk_04.sql` | 78권 800행 | 누적 3,200 |
| 6 | `chunk_05.sql` | 90권 800행 | 누적 4,000 |
| 7 | `chunk_06.sql` | 95권 800행 | 누적 4,800 |
| 8 | `chunk_07.sql` | 77권 800행 | 누적 5,600 |
| 9 | `chunk_08.sql` | 69권 745행 | 누적 6,345 |
| 10 | `chunk_09.sql` | 39권 435행 | 누적 **6,780** |
| 11 | `step2_merge.sql` **(리허설)** | 조인 UPDATE — 끝줄 `rollback;` | **verdict = PASS** |
| 12 | `step2_merge.sql` **(본실행)** | 끝줄을 `commit;` 으로 **직접 고쳐** 재실행 | **verdict = PASS** |
| 13 | `step3_verify.sql` | COMMIT 후 최종 검증 | (a)~(e) 전항 일치 |
| 14 | `step4_drop.sql` | staging 정리 | `staging_tables` 0 |

> ※ 권수 합계(76+69+84+78+90+95+77+69+39 = 677)는 669보다 크다. **한 권이 청크 경계에
> 걸치면 양쪽에 계수되기 때문**이며 오류가 아니다. 행 합계 6,780이 정본이다.

## step2_merge 검증 항목

| 검증 | 항목 | 기대 |
|---|---|---|
| V0 | rows_before / books_before / not_null_before | 9,496 / 860 / 2,597 |
| V1 | `staging_rows` | 6,780 |
| V2 | `unmatched_books` — books 조인 실패 | 0 |
| V3 | `unmatched_pages` — 대응 `book_text` 행 없음 | 0 |
| V4 | rows_after / books_after / not_null_after | 9,496(불변) / 860(불변) / 9,377 |
| V5 | `bad_url` (`not like 'http%'`) | 0 |
| V6 | **`verdict`** — 화면에 남는 최종 1행 | **`PASS`** |

### ★ ADR-0053 E9 재발 방지

SQL Editor는 **다중 문장 실행 시 마지막 문장의 결과만** 표시한다. 그래서 `step2_merge.sql`의
마지막 SELECT(V6)를 **PASS/FAIL 단일 행**으로 만들었다.

- **화면의 `verdict` 값으로만 판정한다.** 파일 안의 기대값 주석은 판정 근거가 아니다.
- 리허설(끝줄 `rollback;`)과 본실행(끝줄 `commit;`)은 **화면 출력이 같다.** 어느 쪽을 돌렸는지는
  끝줄을 직접 확인해야 한다. 본실행 후에는 반드시 `step3_verify.sql`로 **영속 여부**를 확인한다
  (COMMIT이 안 됐다면 step3의 not_null이 2,597에 머문다).
- **`step4_drop.sql`은 step3가 PASS한 뒤에만 실행한다.** staging을 먼저 지우면 재머지 경로가
  사라진다(E9에서 실제로 발생한 사고).

## 남는 NULL 119행은 정상이다

백필 후에도 `image_url IS NULL`이 **119행(ASb 30권)** 남는다. 매니페스트의 이미지 수가 텍스트 수보다
적은 면이며, ADR-0025 Amd#6 A3의 "텍스트만 있는 면"에 해당한다. **오류가 아니다.**

`step3_verify.sql` (c)가 권별 NULL 개수를 출력한다 — `per_book.csv`의 `missing` 열과 **1:1로
일치**해야 한다. 총계만 맞고 배분이 틀린 상태를 통과시키지 않는다(ADR-0057 D5-④ (c) · ADR-0056 §5-c).

이 119행이 ADR-0057 **D3 폴백**(텍스트 전용 면 표시)의 실제 발현 대상이며, **O-2**가 예고한 집합이다.

## 근거 파일

| 파일 | 내용 |
|---|---|
| `_dryrun_report.json` | 집계 리포트 — 권수·행수·이미지<텍스트·fetch 실패·URL 스킴 위반 |
| `per_book.csv` | 권별 1행 (`n_text` / `n_image` / `emitted` / `missing` / `extra`) — step3 (c) 대조 정본 |

### 드라이런 결과 (2026-08-13, 669권 전수)

```
fetch          성공 669 / 실패 0
이미지 행      6,780  (asb 5,211 · bloom 1,569)
이미지<텍스트   30권 / 119행   → image_url 미생성(NULL 유지)
이미지>텍스트  466권 / 518행   → 대응 book_text 행 없음, 버림
URL 스킴 위반   0             → 전량 https:// 절대 URL
```

**ADR-0056 §Context 3(2026-08-08 독립 드라이런)과 전 항목 폐합**:
ASb `axis_diff` 분포 `{-7:1, -4:6, -3:2, -2:24, -1:433, 0:31, 1:11, 2:4, 3:7, 4:3, 6:1, 7:1, 9:1, 13:1, 32:1}`가
버킷 단위로 완전 일치하고, ASb 텍스트 5,330 · 이미지 5,729 · Bloom 1,569/1,569도 일치한다.
→ **2026-08-10 적재 이후 매니페스트가 변하지 않았다** = `page_index` 축이 적재본과 정합한다
(ADR-0056 O2 리스크 불발현). 팀장 실측과도 폐합: 9,496 − 2,597 = 6,899 = 5,330 + 1,569.

## 재생성

```
python scripts/image_backfill/build_asb_bloom_image_backfill.py            # 전수 재실행
python scripts/image_backfill/build_asb_bloom_image_backfill.py --resume   # 중단 후 이어서
python scripts/image_backfill/build_asb_bloom_image_backfill.py --check-input   # 네트워크 0
```

산출은 `scripts/image_backfill/out/` (gitignore `out/` 대상, 재생성 가능 작업본)에 떨어진다.
**팀장 실행 정본은 본 디렉토리다**(ADR-0053 Amd#4 규약 — 실행 SQL은 `docs/sql/` 아래).
