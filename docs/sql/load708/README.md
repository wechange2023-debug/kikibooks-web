# load708 — 708권 book_audio 적재 실행 순서

생성: `scripts/tts_pilot/gen_book_audio_sql_708.py` (워커, DB 접속 0건)  
근거: ADR-0053 D4 / ADR-0034 / ADR-0052 D5·Amd#2·D8

**총 708권 / 7,978행** (page 7,270 + cover 708)

## 왜 파일이 여러 개인가

v1은 플랫폼별 단일 파일이었는데 step1이 1.1MB라 SQL Editor가
`Query is too large to be run via the SQL Editor` 로 거부했다.
그래서 **VALUES 적재(무거움)** 와 **본 테이블 머지(가벼움)** 를 분리했다.

- 청크 파일은 staging 테이블에만 넣는다 → 실패해도 `book_audio` 무접촉
- 머지 파일은 VALUES가 없어 짧다 (staging에서 SELECT) → 크기 제한과 무관
- 원자성은 머지 단계에서 유지: 플랫폼 단위로 통째 COMMIT 또는 통째 ROLLBACK

## 실행 순서

| # | 파일 | 내용 | 기대값 |
|---|---|---|---|
| 1 | `00_staging_create.sql` | staging 테이블 생성 | `staging_rows` 0 |
| 2 | `01_chunk_01.sql` | 69권 779행 적재 | `chunk_rows` 779 / `total_rows` 779 |
| 3 | `01_chunk_02.sql` | 60권 786행 적재 | `chunk_rows` 786 / `total_rows` 1,565 |
| 4 | `01_chunk_03.sql` | 67권 786행 적재 | `chunk_rows` 786 / `total_rows` 2,351 |
| 5 | `01_chunk_04.sql` | 67권 785행 적재 | `chunk_rows` 785 / `total_rows` 3,136 |
| 6 | `01_chunk_05.sql` | 75권 787행 적재 | `chunk_rows` 787 / `total_rows` 3,923 |
| 7 | `01_chunk_06.sql` | 74권 783행 적재 | `chunk_rows` 783 / `total_rows` 4,706 |
| 8 | `01_chunk_07.sql` | 81권 777행 적재 | `chunk_rows` 777 / `total_rows` 5,483 |
| 9 | `01_chunk_08.sql` | 63권 694행 적재 | `chunk_rows` 694 / `total_rows` 6,177 |
| 10 | `01_chunk_09.sql` | 52권 607행 적재 | `chunk_rows` 607 / `total_rows` 6,784 |
| 11 | `01_chunk_10.sql` | 53권 597행 적재 | `chunk_rows` 597 / `total_rows` 7,381 |
| 12 | `01_chunk_11.sql` | 45권 571행 적재 | `chunk_rows` 571 / `total_rows` 7,952 |
| 13 | `01_chunk_12.sql` | 2권 26행 적재 | `chunk_rows` 26 / `total_rows` 7,978 |
| 14 | `02_staging_verify.sql` | 전량 게이트 | **verdict = PASS** |
| 15 | `03_merge_step1_asb.sql` | african_storybook 527권 5855행 머지 | 적재 후 danielle 655권 7,469행 |
| 16 | `04_merge_step2_bloom.sql` | bloom 142권 1616행 머지 | 적재 후 danielle 797권 9,085행 |
| 17 | `05_merge_step3_bookdash.sql` | book_dash 39권 507행 머지 | 적재 후 danielle 836권 9,592행 |
| 18 | `06_final_verify.sql` | 최종 검증 | **verdict = PASS** |
| 19 | `07_staging_drop.sql` | staging 정리 | `should_be_null` NULL |

## 규칙

- **청크(01)** 는 그냥 순서대로 실행하면 된다. 멱등이라 두 번 돌려도 안전하다.
  재실행 시 `INSERT 0 0` 이 뜨는 건 정상(이미 들어있다는 뜻).
- **머지(03~05)** 는 파일 끝이 `ROLLBACK;` 이다. 기대값이 전부 맞으면
  `ROLLBACK;` 을 `COMMIT;` 으로 **직접 고쳐 타이핑** 한 뒤 다시 실행한다.
- **게이트(02, 06)** 의 `verdict` 가 `PASS` 가 아니면 다음 단계로 넘어가지 않는다.
- 머지의 `DO` 블록에서 `STOP:` 으로 시작하는 에러가 나면 fail-closed 가드가 걸린 것이다.
  이후 문장들이 `current transaction is aborted` 로 줄줄이 실패하는 건 정상 —
  **맨 처음 뜬 STOP 메시지만** 워커에게 전달하면 된다.

## 처음부터 다시 하고 싶을 때

```sql
TRUNCATE public.book_audio_staging_708;
```

을 실행하고 `01_chunk_01` 부터 다시 돌린다. 보통은 필요 없다 —
청크가 멱등이라 실패한 지점부터 이어서 실행하면 된다.

머지를 이미 COMMIT 한 뒤 되돌리려면:

```sql
DELETE FROM public.book_audio a
 USING public.book_audio_staging_708 s
 WHERE a.audio_path = s.audio_path AND a.voice = 'danielle';
```

staging을 DROP 하기 전에만 쓸 수 있다(그래서 07은 맨 마지막이다).

## 기존 행 보호

- 기존 danielle 128권 1,614행(pilot12+fullbatch116)과 book_id 교집합 **0** — 로컬 산출물 대조 확인
- 구 44권은 `voice='Ruth'` 라 UNIQUE에서 자연 분리 — 무접촉
- 머지 INSERT에 `ON CONFLICT` 절이 **없다** → 충돌 시 에러로 죽는다(덮어쓰기 구조적 불가)
- `book_id` 는 VALUES에 박지 않고 `(source_platform, source_id)` 로 `books` 를 조인해
  얻은 값을 쓴다. 매니페스트 `book_id` 와 불일치하면 `RAISE EXCEPTION`

## v1 파일

`docs/sql/deprecated/` 로 옮겼다(이력 보존). 실행하지 말 것 — Editor 크기 제한에 걸린다.
