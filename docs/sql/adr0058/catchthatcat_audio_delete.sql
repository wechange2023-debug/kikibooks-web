-- =============================================================================
-- catchthatcat_audio_delete.sql — catch-that-cat book_audio 13행 전삭제 (A안)
--
-- ★ 실행자: 팀장 (Supabase SQL Editor). 워커 DB 쓰기 금지(ADR-0058 D7-①). ★
--
-- 목적  : 재합성 표준 4단계(ADR-0058 Amendment #1 G1)의 **①단계**.
--         book_audio 행을 지우면 hasBookAudio가 행 존재로만 판정하므로
--         [TTS 생성 요청] 버튼 잠금이 **자동 해제**된다(G1 ② — 코드 변경 0건).
-- 성격  : BEGIN … ROLLBACK 리허설이다. **COMMIT 문은 이 파일에 없다.**
--         기대값이 맞으면 맨 끝 ROLLBACK을 COMMIT으로 **직접 고쳐 타이핑**한 뒤
--         재실행할 것(ADR-0053 E9 규약 · 기존 requests/*.sql 선례 동일).
--
-- 대상 (워커 로컬 실측 2026-08-18, 읽기 전용 조회)
-- -----------------------------------------------------------------------------
--   book_id = 56027756-fc5d-45f9-8b8c-fe33727e6089  (book_dash / catch-that-cat)
--   book_audio 13행 = kind 'page' 12 (page_index 0~11) + kind 'cover' 1
--   voice 전건 'danielle' · marks_path NULL 0건
--   created_at 13행 전부 2026-08-14T02:38:09Z (단일 적재 트랜잭션)
--   대응 Storage 객체 26개(mp3 13 + marks 13) — 파일명 전건 일치 확인
--
-- ★ 다른 도서 무영향
-- -----------------------------------------------------------------------------
--   [2]의 WHERE 는 book_id **단일 값 등호 비교** 하나뿐이다. IN·LIKE·서브쿼리 0건.
--   RETURNING 이 실제 삭제된 행을 전량 돌려주므로 대상 외 행이 섞이면 즉시 드러난다.
--
-- ★ Storage 는 건드리지 않는다
-- -----------------------------------------------------------------------------
--   ADR-0058 Amd#1 G2 — "객체를 삭제하지 않는다. `--overwrite`로 덮어쓴다."
--   본 SQL은 DB 행만 지운다. Storage 객체 26개는 그대로 남으며, 재합성 후
--   `--upload --overwrite` 가 같은 키를 원자적으로 교체한다.
--
-- ★ book_review.status 는 바꾸지 않는다 (판단 근거는 아래 §관례 실측)
-- -----------------------------------------------------------------------------
--   현재 status = 'tts_done'. 재요청까지 가려면 in_review → confirmed 전이가 필요하나,
--   그 전이는 **검수 화면 조작**이 담당한다(G1 ③단계 주체 = 팀장, 행위 = 화면).
--   화면 전이(lib/admin/review/actions.ts:315-321)는 status·reviewed_at·reviewer_id
--   **3컬럼을 함께** 갱신한다. SQL로 status만 바꾸면 reviewed_at·reviewer_id가 낡은
--   값으로 남아 "누가 언제 움직였는가"가 어긋난다. 그래서 여기서는 손대지 않는다.
--   화면만으로 도달 가능하다 — 전이표(actions.ts:111-117)에 tts_done → in_review 가 있다.
--
-- 실행법 · 결과 보는 법
-- -----------------------------------------------------------------------------
--   파일 전체를 붙여넣고 한 번에 실행한다. **SQL Editor는 마지막 SELECT만 표시**하므로
--   판정 기준은 [4]의 verdict 열이다(기존 requests/*.sql 과 동일 규약).
--   [1]·[3]의 숫자를 눈으로 보고 싶으면 그 문장만 블록 선택해 따로 실행할 것.
--   [1]을 먼저 블록 실행해 all_rows 값을 적어 두면, [4]의 after_all_rows 가
--   정확히 **13 줄어든 값**인지 대조할 수 있다.
-- =============================================================================

BEGIN;

-- [1] 삭제 전 COUNT (기대: target_rows = 13)
SELECT
  (SELECT count(*) FROM public.book_audio
    WHERE book_id = '56027756-fc5d-45f9-8b8c-fe33727e6089')  AS target_rows,
  (SELECT count(*) FROM public.book_audio)                   AS all_rows,
  (SELECT count(DISTINCT book_id) FROM public.book_audio)    AS distinct_books;

-- [2] 삭제 — WHERE 는 book_id 단일 값. RETURNING 으로 삭제된 13행을 전량 확인한다.
DELETE FROM public.book_audio
 WHERE book_id = '56027756-fc5d-45f9-8b8c-fe33727e6089'
RETURNING id, book_id, kind, page_index, voice, audio_path, marks_path, created_at;

-- [3] 삭제 후 COUNT (기대: target_rows = 0)
SELECT
  (SELECT count(*) FROM public.book_audio
    WHERE book_id = '56027756-fc5d-45f9-8b8c-fe33727e6089')  AS target_rows,
  (SELECT count(*) FROM public.book_audio)                   AS all_rows,
  (SELECT count(DISTINCT book_id) FROM public.book_audio)    AS distinct_books;

-- [4] 후검증 — 마지막 SELECT만 SQL Editor에 표시된다. 이 verdict 가 판정 기준이다.
SELECT
  '56027756-fc5d-45f9-8b8c-fe33727e6089'::uuid               AS book_id,
  13                                                          AS expected_deleted,
  (SELECT count(*) FROM public.book_audio
    WHERE book_id = '56027756-fc5d-45f9-8b8c-fe33727e6089')  AS after_target_rows,
  (SELECT count(*) FROM public.book_audio)                   AS after_all_rows,
  (SELECT count(DISTINCT book_id) FROM public.book_audio)    AS after_distinct_books,
  (SELECT status FROM public.book_review
    WHERE book_id = '56027756-fc5d-45f9-8b8c-fe33727e6089')  AS review_status_unchanged,
  CASE
    WHEN (SELECT count(*) FROM public.book_audio
           WHERE book_id = '56027756-fc5d-45f9-8b8c-fe33727e6089') = 0
    THEN 'PASS — 13행 삭제 확인. ROLLBACK을 COMMIT으로 고쳐 재실행할 것'
    ELSE 'FAIL — 잔여 행이 있다. 수치를 워커에게 전달할 것'
  END                                                         AS verdict;

ROLLBACK;   -- ← 기대값 일치 시 COMMIT 으로 고쳐 재실행

-- =============================================================================
-- 다음 단계 (COMMIT 이후, 팀장 화면 조작) — docs/ops/trackB-review-guide.md 참조
--   ② 잠금 자동 해제 → ③ 검수 화면 [되돌리기] → [확정] → [TTS 생성 요청]
--   ④ 워커: 드라이런 → --execute → --upload --overwrite → 적재 SQL 생성
-- =============================================================================
