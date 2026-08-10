# Bloom 10권 소량 실전 적재 — 팀장 실행 안내

> **근거** ADR-0056 (Accepted 2026-08-10) D1·D2·D4·D5·D6·D7
> **생성기** `scripts/tts_pilot/gen_book_text_sql_v2.py`
> **게이트 위치** 소량 실전(본 문서) → 검증 통과 → 전량 적재
> **워커 실행분** DB 쓰기 0 · Storage 0. 아래 SQL 실행은 전부 팀장 영역이다.

---

## 1. 대상 10권 (135면 / 6,217자)

| # | source_id | 면 | 빈 면 | 정제자 | 제목 |
|---:|---|---:|---:|---:|---|
| 1 | `01bb98de-b779-48c8-8f0f-d910a49ab07f` | 10 | **5** | 112 | Big and little |
| 2 | `a44e50a7-1b1d-4861-a066-4efda45b1b72` | 21 | **14** | 606 | My Favorite Color |
| 3 | `aa66ad93-d1a3-4f4e-996c-3b98d7b77765` | 4 | 0 | 154 | Clouds |
| 4 | `33c35227-7327-4f01-ae44-4167269d1472` | 7 | 0 | 279 | Can and Can't |
| 5 | `cb1d0cee-1203-48a0-96ee-176ef8f3f6d8` | 8 | 0 | 626 | Where is my Dolly? |
| 6 | `8d7d0cee-5d21-41b3-92c4-aaf741bb6947` | 10 | 0 | 358 | What Are They Doing? |
| 7 | `8b280edc-ab53-4598-9129-085bb2e04455` | 11 | 0 | 361 | A Very Tall Man |
| 8 | `8cbf55b5-c0de-490c-84c4-d3dc73bf34cc` | 12 | 0 | 1,004 | The day the Sun went away |
| 9 | `05bdb04b-3f95-4e7f-9332-f5444a7fca1a` | 25 | 0 | 1,388 | Noakawir and the Beans |
| 10 | `24cf0eb3-8688-483e-a279-8c2a53f0e884` | 27 | 0 | 1,329 | We Are All Animals |
| | **합계** | **135** | **19** | **6,217** | |

**선정 근거**: 1·2번은 **무텍스트 면 보유 권**(D7 경계 사례 — 빈 면도 `text=''` 행을 만드는지
확인용)이며, 두 권만으로 빈 면 19행 중 19행 전부를 담당한다. 3~10번은 빈 면 0인 정상 권 중
면수 4·7·8·10·11·12·25·27로 **분산 표집**해 소·중·대 규모를 모두 덮었다.

---

## 2. 실행 순서

파일은 `scripts/tts_pilot/out/sql/` 에 있다. **반드시 아래 순서로 한 파일씩** 실행한다.

| 순서 | 파일 | 담당 |
|---:|---|---|
| 1 | `bloom_pilot10_1of2.sql` | 5권 / **80행** (빈 면 5행 포함) |
| 2 | `bloom_pilot10_2of2.sql` | 5권 / **55행** (빈 면 14행 포함) |

각 파일 안의 절차:

1. **[선검증]** `(a)` `rows_before` = **0**, `(b)` `books_found` = **5** 확인
   - `(a)`가 0이 아니면 → **즉시 중단**하고 보고. 이미 적재된 행이 있다는 뜻이다.
   - `(b)`가 5가 아니면 → **즉시 중단**. `source_id`가 `books`에 없다.
2. **[적재]** `BEGIN;` ~ `INSERT` 실행
3. **[적재검증]** `(c)`~`(g)`를 확인 (기대값은 파일 주석에 각각 명시돼 있다)
4. **전부 일치하면** 파일 마지막의 `ROLLBACK;` 을 **`COMMIT;` 으로 직접 바꿔 타이핑**해 확정
   - 하나라도 어긋나면 `ROLLBACK;` 그대로 실행하고 보고

> 파일은 `ROLLBACK;` 으로 끝나도록 생성돼 있다. `COMMIT` 문자열은 파일 어디에도
> 실행문으로 존재하지 않는다 — 확정은 팀장의 직접 타이핑으로만 일어난다.

---

## 3. 실행 후 검증 SELECT (2파일 모두 COMMIT 후 1회)

```sql
-- ① 권수·행수 총계 — 기대: books 10 / rows 135
SELECT count(DISTINCT bt.book_id) AS books, count(*) AS rows
FROM book_text bt JOIN books b ON b.id = bt.book_id
WHERE b.source_platform = 'bloom' AND bt.source = 'manifest_txt_v1';

-- ② 권별 면수·축 — 기대: 10행, 각 행 mn=0, mx=n-1
SELECT b.source_id, b.title, count(*) AS n,
       min(bt.page_index) AS mn, max(bt.page_index) AS mx
FROM book_text bt JOIN books b ON b.id = bt.book_id
WHERE b.source_platform = 'bloom' AND bt.source = 'manifest_txt_v1'
GROUP BY b.source_id, b.title ORDER BY n;

-- ③ 빈 면 (D7) — 기대: 19행. 그중 14행이 My Favorite Color, 5행이 Big and little
SELECT b.title, count(*) AS empty_rows
FROM book_text bt JOIN books b ON b.id = bt.book_id
WHERE b.source_platform = 'bloom' AND bt.source = 'manifest_txt_v1' AND bt.text = ''
GROUP BY b.title ORDER BY empty_rows DESC;

-- ④ 표본 육안 — Clouds 4면. page_index 0~3, 텍스트가 화면 순서와 맞는지 확인
SELECT bt.page_index, bt.text
FROM book_text bt JOIN books b ON b.id = bt.book_id
WHERE b.source_platform = 'bloom'
  AND b.source_id = 'aa66ad93-d1a3-4f4e-996c-3b98d7b77765'
ORDER BY bt.page_index;

-- ⑤ 오염 없음 확인 — 기대: manifest_txt_v1 1종 / 135행
SELECT bt.source, count(*) FROM book_text bt JOIN books b ON b.id = bt.book_id
WHERE b.source_platform = 'bloom' GROUP BY bt.source;

-- ⑥ 범위 밖 무접촉 — 기대: 0 (Bloom 나머지 132권은 아직 적재 대상이 아니다)
SELECT count(DISTINCT bt.book_id) AS unexpected
FROM book_text bt JOIN books b ON b.id = bt.book_id
WHERE b.source_platform = 'bloom'
  AND b.source_id NOT IN (
    '01bb98de-b779-48c8-8f0f-d910a49ab07f','a44e50a7-1b1d-4861-a066-4efda45b1b72',
    'aa66ad93-d1a3-4f4e-996c-3b98d7b77765','33c35227-7327-4f01-ae44-4167269d1472',
    'cb1d0cee-1203-48a0-96ee-176ef8f3f6d8','8d7d0cee-5d21-41b3-92c4-aaf741bb6947',
    '8b280edc-ab53-4598-9129-085bb2e04455','8cbf55b5-c0de-490c-84c4-d3dc73bf34cc',
    '05bdb04b-3f95-4e7f-9332-f5444a7fca1a','24cf0eb3-8688-483e-a279-8c2a53f0e884');
```

---

## 4. 이상 시 대응

| 증상 | 원인 후보 | 대응 |
|---|---|---|
| `(a) rows_before` ≠ 0 | 이미 적재됨 / 다른 경로 유입 | **중단·보고.** 덮어쓰지 않는다(`DO NOTHING`이라 안전하나 전제가 깨진 것) |
| `(b) books_found` ≠ 5 | `source_id` 불일치, 권 비활성·삭제 | **중단·보고.** 명단 재확인 필요 |
| `(c) rows_after` < 기대 | `ON CONFLICT`로 일부 스킵됨 | **중단·보고.** `(a)`가 0이었다면 발생할 수 없다 |
| `(d)` 행 출력됨 | 조인 실패 `source_id` | **중단·보고.** 해당 권만 명단에서 제외 후 재생성 |
| `(f)` 행 출력됨 | `page_index` 축 깨짐 | **중단·보고.** 하이라이트 오프셋 문제로 직결 |
| `(g) empty_rows` ≠ 기대 | 정제 규칙 불일치 | **중단·보고.** `sanitize()` 공유가 깨진 것 |
| COMMIT 후 되돌리고 싶을 때 | — | `DELETE FROM book_text WHERE source='manifest_txt_v1'` (ADR-0056 D5 되돌리기). **현 시점 이 라벨은 본 10권뿐**이라 안전하다 |

---

## 5. 워커 자체 검증 결과 (실행 전 사전 확인 완료)

| 항목 | 기대 | 실측 | 판정 |
|---|---:|---:|---|
| 권수 | 10 | 10 | PASS |
| INSERT 행수 = 면수 합 | 135 | 135 | PASS |
| 빈 면 행수 (D7) | 19 | 19 | PASS |
| 정제 후 문자수 | 6,217 | 6,217 | PASS |
| `page_index` 0..N−1 연속 | 위반 0 | 0 | PASS |
| `$$` 인용 파손 | 0건 | 0건 | PASS |
| `ROLLBACK;` 종료 · `COMMIT;` 실행문 0 | — | 확인 | PASS |

기대값 출처는 커밋된 669권 드라이런(`scratchpad/text_harvest/asb_bloom_dryrun.csv`)이며,
생성 SQL을 **역파싱해 대조**했다. 즉 원천 → 드라이런 → SQL 3자가 같은 값이다.
