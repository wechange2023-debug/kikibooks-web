# 전량 `book_text` 적재 — 팀장 실행 안내 (698권 7,233행)

> **근거** ADR-0056 (Accepted 2026-08-10, **O6 Resolved 2026-08-10**) D1~D14
> **생성기** `scripts/tts_pilot/gen_book_text_sql_v2.py`
> **선행 완료** Bloom 소량 10권(135행) 실행·COMMIT 및 검증 ①~⑥ 통과 → 소량 게이트 통과
> **워커 실행분** DB 쓰기 0 · Storage 0. 아래 SQL 실행은 전부 팀장 영역이다.

## 0. 범위와 검산

| 구분 | 권수 | 행수 |
|---|---:|---:|
| 이미 적재 완료 (Bloom 소량) | 10 | 135 |
| **이번 적재분** | **698** | **7,233** |
| └ ASb `african_storybook` | 527 | 5,330 |
| └ Bloom 잔여 | 132 | 1,434 |
| └ Book Dash html (D9-a 34 + D9-b 5) | 39 | 469 |
| **최종 총계** | **708** | **7,368** |

검산: 698 + 10 = **708** ✅ / 7,233 + 135 = **7,368** ✅ / 527+132+39 = **698** ✅

정제 후 문자수 7,233행분 = **811,785자**. 기적재 6,217자를 더하면 **818,002자**로
ADR-0053 D4 최종 리포트(`_d4_dryrun_708_final.json`)의 본문 총계와 **정확히 일치**한다.

---

## 1. 실행 순서 — 15개 파일, 한 번에 한 파일

파일은 전부 `scripts/tts_pilot/out/sql/` 에 있다. **아래 순서대로** 실행한다.
코호트 간 순서는 바꿔도 무방하나, **한 파일을 끝까지 마치고 다음 파일로** 넘어간다.

각 파일의 절차는 소량 때와 **동일**하다:

1. **[선검증]**(트랜잭션 밖) `(a) rows_before` · `(b) books_found` 확인
2. **[적재]** `BEGIN;` ~ `INSERT`
3. **[적재검증]**(트랜잭션 안) `(c)`~`(g)` 확인
4. 전부 일치하면 마지막 `ROLLBACK;` 을 **`COMMIT;` 으로 직접 바꿔 타이핑**
   - 하나라도 어긋나면 `ROLLBACK;` 실행 후 보고

> 모든 파일은 `ROLLBACK;` 으로 끝난다. `COMMIT;` 은 **실행문으로 어느 파일에도 없다**.

### 파일별 기대값

`(a) rows_before` = **0** · `(d)` = **0행** · `(f)` = **0행** 은 전 파일 공통.
`(b) books_found` = 권수 · `(c) rows_after` = 행수 · `(g) empty_rows` = 빈 면.

| 파일 | `(b)` 권수 | `(c)` 행수 | `(g)` 빈 면 | 크기 |
|---|---:|---:|---:|---:|
| `asb527_1of11.sql` | 48 | 478 | 0 | 77 KB |
| `asb527_2of11.sql` | 48 | 582 | 1 | 80 KB |
| `asb527_3of11.sql` | 48 | 549 | 0 | 59 KB |
| `asb527_4of11.sql` | 48 | 508 | 0 | 63 KB |
| `asb527_5of11.sql` | 48 | 467 | 0 | 70 KB |
| `asb527_6of11.sql` | 48 | 543 | 0 | 110 KB |
| `asb527_7of11.sql` | 48 | 438 | 0 | 66 KB |
| `asb527_8of11.sql` | 48 | 454 | 1 | 92 KB |
| `asb527_9of11.sql` | 48 | 465 | 0 | 82 KB |
| `asb527_10of11.sql` | 48 | 382 | 0 | 70 KB |
| `asb527_11of11.sql` | 47 | 464 | 0 | 74 KB |
| **ASb 소계** | **527** | **5,330** | **2** | |
| `bloom_rest132_1of3.sql` | 44 | 448 | 20 | 62 KB |
| `bloom_rest132_2of3.sql` | 44 | 496 | 25 | 71 KB |
| `bloom_rest132_3of3.sql` | 44 | 490 | 31 | 66 KB |
| **Bloom 잔여 소계** | **132** | **1,434** | **76** | |
| `bdhtml39_1of1.sql` | 39 | 469 | 1 | 113 KB |
| **합계** | **698** | **7,233** | **79** | |

**분할 기준**: 파일당 약 380~580행(59~113 KB)으로 잘랐다. SQL Editor 1회 실행에 부담이 없는
크기이며, 실패 시 되돌릴 범위도 한 파일로 국한된다. 권이 파일 경계를 넘지 않으므로
파일 단위로 권이 온전히 들어간다.

---

## 2. 전체 완료 후 최종 검증 SELECT

15개 파일 전부 COMMIT한 뒤 **1회** 실행한다. 기대값은 **기적재 10권을 합산한 708권 기준**이다.

```sql
-- ① 전 코호트 총계 — 기대: books 708 / rows 7368
SELECT count(DISTINCT bt.book_id) AS books, count(*) AS rows
FROM book_text bt JOIN books b ON b.id = bt.book_id
WHERE bt.source IN ('manifest_txt_v1', 'html_scene_json_v1');

-- ② 코호트별 권수·행수
--    기대: african_storybook 527/5330 · bloom 142/1569 · book_dash 39/469
SELECT b.source_platform, bt.source,
       count(DISTINCT bt.book_id) AS books, count(*) AS rows
FROM book_text bt JOIN books b ON b.id = bt.book_id
WHERE bt.source IN ('manifest_txt_v1', 'html_scene_json_v1')
GROUP BY b.source_platform, bt.source
ORDER BY b.source_platform;

-- ③ 빈 면 (D7) — 기대: 총 98행
--    (ASb 2 · Bloom 95 = 잔여 76 + 기적재 19 · Book Dash html 1)
SELECT b.source_platform, count(*) AS empty_rows
FROM book_text bt JOIN books b ON b.id = bt.book_id
WHERE bt.source IN ('manifest_txt_v1', 'html_scene_json_v1') AND bt.text = ''
GROUP BY b.source_platform;

-- ④ 라벨 분포 — 기대 3종:
--    pdf_harvest_v2_orderfix (기존 Book Dash asb_native 151권, 무접촉)
--    manifest_txt_v1 6899행 / html_scene_json_v1 469행
SELECT source, count(*) AS rows, count(DISTINCT book_id) AS books
FROM book_text GROUP BY source ORDER BY rows DESC;

-- ⑤ page_index 축 — 기대 0행 (권마다 0부터 연속)
SELECT b.source_platform, b.source_id, count(*) AS n,
       min(bt.page_index) AS mn, max(bt.page_index) AS mx
FROM book_text bt JOIN books b ON b.id = bt.book_id
WHERE bt.source IN ('manifest_txt_v1', 'html_scene_json_v1')
GROUP BY b.source_platform, b.source_id
HAVING min(bt.page_index) <> 0 OR max(bt.page_index) <> count(*) - 1;

-- ⑥ 범위 밖 무접촉 — 기대 0행.
--    기존 Book Dash asb_native 151권(pdf_harvest_v2_orderfix)에 새 라벨이 섞이지 않았는지.
SELECT count(*) AS contaminated
FROM book_text bt JOIN books b ON b.id = bt.book_id
WHERE b.source_platform = 'book_dash'
  AND bt.source = 'manifest_txt_v1';   -- book_dash에는 이 라벨이 없어야 한다

-- ⑦ 블랙리스트 무접촉 — 기대 0행 (비활성 15권에 적재되지 않았는지)
SELECT count(DISTINCT bt.book_id) AS inactive_loaded
FROM book_text bt JOIN books b ON b.id = bt.book_id
WHERE bt.source IN ('manifest_txt_v1', 'html_scene_json_v1') AND b.is_active = false;

-- ⑧ 표본 육안 — D9-b 1권(a-beautiful-day). page_index 0~11, 이미지와 짝이 맞는지
--    ※ ADR-0056 D9-b가 요구한 "적재 후 육안 검증 1권"이 이 항목이다.
SELECT bt.page_index, left(bt.text, 60) AS head
FROM book_text bt JOIN books b ON b.id = bt.book_id
WHERE b.source_platform = 'book_dash'
  AND b.source_id = '9c9e94e0-fe46-11e5-86aa-5e5517507c66'
ORDER BY bt.page_index;
```

### ⑧ 육안 검증 안내 (D9-b 필수 절차)

ADR-0056 D9-b는 **적재 후 육안 검증 1권**을 요구한다. `/admin/review`의 해당 권 상세에서
이미지와 텍스트가 나란히 보이므로, **면 번호와 그림 내용이 맞는지** 확인한다.
어긋나면 `DELETE FROM book_text WHERE source='html_scene_json_v1'` 로 39권분만 되돌린다.

---

## 3. 이상 시 대응

| 증상 | 원인 후보 | 대응 |
|---|---|---|
| `(a) rows_before` ≠ 0 | 해당 파일이 이미 실행됨 / 다른 경로 유입 | **중단·보고.** `DO NOTHING`이라 덮어쓰지는 않으나 전제가 깨진 것 |
| `(b) books_found` ≠ 기대 | `source_id` 불일치, 권 삭제 | **중단·보고.** 명단 재확인 필요 |
| `(c) rows_after` < 기대 | `ON CONFLICT` 스킵 발생 | **중단·보고.** `(a)`가 0이었다면 발생할 수 없다 |
| `(d)` 행 출력 | 조인 실패 `source_id` | **중단·보고.** 해당 권 제외 후 재생성 |
| `(f)`/⑤ 행 출력 | `page_index` 축 깨짐 | **중단·보고.** 하이라이트 오프셋 문제로 직결 |
| `(g)` 빈 면 수 불일치 | 정제 규칙 불일치 | **중단·보고.** `sanitize()` 공유가 깨진 것 |
| ⑥ ≠ 0 | 라벨 오염 | **중단·보고.** 기존 151권 트랙 침범 |
| ⑦ ≠ 0 | 비활성·블랙리스트 권 적재 | **중단·보고.** 명단 오염 |
| 중간에 되돌리고 싶을 때 | — | 코호트 단위: `DELETE FROM book_text WHERE source='html_scene_json_v1'`(39권분) / `'manifest_txt_v1'`(669권분, **기적재 10권 포함**) — ADR-0056 D5·D12 되돌리기 |

> **되돌리기 주의**: `manifest_txt_v1` 삭제는 이미 COMMIT한 **Bloom 10권까지 함께** 지운다.
> 10권만 남기려면 `AND b.source_id NOT IN (…)` 로 제외하거나, 전부 지우고 15개 파일을
> 처음부터 다시 실행한다(생성 SQL은 재실행 안전 — `DO NOTHING`).

---

## 4. 워커 자체 검증 결과 (실행 전 사전 확인 완료)

생성 SQL을 **역파싱**해 원천(드라이런 CSV / 로컬 json)과 대조했다 — 원천·드라이런·SQL 3자 일치.

| 코호트 | 파일 | 권수 | 행수 | 빈 면 | 정제자 | 기대 대비 |
|---|---:|---:|---:|---:|---:|---|
| ASb | 11 | 527 | 5,330 | 2 | 661,840 | PASS |
| Bloom 잔여 | 3 | 132 | 1,434 | 76 | 76,351 | PASS |
| Book Dash html | 1 | 39 | 469 | 1 | 73,594 | PASS |
| **합계** | **15** | **698** | **7,233** | **79** | **811,785** | **PASS** |

추가 게이트 (전부 PASS):

- 권수 폐합 698 + 10 = **708** · 행수 폐합 7,233 + 135 = **7,368**
- 문자수 폐합 811,785 + 6,217 = **818,002** = D4 최종 리포트 본문 총계
- `page_index` 0..N−1 연속 — 698권 전권 위반 0
- `$$` 인용 파손 0건 (`$$` 포함·`$` 종결 전수 가드)
- `ROLLBACK;` 종료 15/15 · `COMMIT;` 실행문 **0건**
- `ON CONFLICT DO NOTHING` · `source` 라벨 · `source_platform` · `blocks NULL` 15/15 존재
- **기적재 10권 재포함 0건** (Bloom 잔여 명단에서 제외 확인)
