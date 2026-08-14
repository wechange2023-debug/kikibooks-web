-- =============================================================================
-- 04_restore_tts_done_catch_that_cat.sql
--   줄바꿈 변경 실험 후 book_review 상태 원복 (in_review → tts_done)
--
-- 근거 ADR: ADR-0058 D2(5상태 제약) · D3(전이표) · D6(tts_done 표기는 적재 SQL 몫)
-- 실행자  : 팀장 (Supabase SQL Editor). 워커 DB 직접 쓰기 금지(ADR-0053 D6-①).
-- 대상    : book_dash-catch-that-cat / book_id 56027756-fc5d-45f9-8b8c-fe33727e6089
--
-- 왜 SQL이 필요한가
-- -----------------------------------------------------------------------------
--   검수 화면의 전이표(lib/admin/review/actions.ts ALLOWED_TRANSITIONS)에는
--   **어떤 상태 → tts_done 항목이 없다**. tts_done 표기는 적재 SQL의 조건부
--   UPDATE만이 만든다(ADR-0058 D6). 따라서 '되돌리기'로 in_review가 된 책은
--   화면에서 tts_done으로 복구할 수 없고, 이 파일이 그 유일한 경로다.
--
--   되돌리기는 book_review.status만 바꾼다 — book_audio 행·Storage 객체는
--   삭제·수정되지 않는다(실측 확인). 즉 원복 대상은 상태 라벨 하나뿐이다.
--
-- ★ 선행 조건: **book_text.text를 실험 전 원문으로 되돌린 뒤** 실행할 것.
--   텍스트를 고친 채 tts_done으로 표기하면, marks 좌표와 어긋난 책이 '음성완료'로
--   기록돼 하이라이트 밀림이 정상 상태로 둔갑한다.
--
-- ★ 실행 방법: 이 파일은 BEGIN … ROLLBACK 단일 트랜잭션이다.
--   03_verify.sql과 달리 **블록을 나눠 실행하지 말고 전체를 한 번에 실행**할 것
--   (SQL Editor는 실행마다 트랜잭션을 새로 열기 때문).
--   기대값이 맞으면 맨 끝 ROLLBACK을 COMMIT으로 직접 고쳐 타이핑한 뒤 재실행한다
--   (ADR-0053 E9 규약).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- [1] 실행 전 상태 박제 — 영향 행수를 정확히 세기 위한 기준값
--     (UPDATE는 status='in_review'일 때만 1행을 건드리므로, 사전 상태가 곧 영향 행수다)
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _restore_before ON COMMIT DROP AS
SELECT status AS status_before
  FROM public.book_review
 WHERE book_id = '56027756-fc5d-45f9-8b8c-fe33727e6089';


-- -----------------------------------------------------------------------------
-- [2] 조건부 UPDATE — in_review인 경우에만 tts_done으로 되돌린다
--     조건부인 이유: 실험 도중 다른 상태(confirmed·tts_requested 등)로 새어 있으면
--     덮어쓰지 않는다. 잘못된 상태를 '완료'로 봉인하는 사고를 막는 장치다.
-- -----------------------------------------------------------------------------
UPDATE public.book_review
   SET status = 'tts_done'
 WHERE book_id = '56027756-fc5d-45f9-8b8c-fe33727e6089'
   AND status = 'in_review';


-- -----------------------------------------------------------------------------
-- [3] 후검증 — 마지막 SELECT만 SQL Editor에 표시된다
-- 기대: rows_matched 1 / status_before 'in_review' / updated_rows 1
--       status_after 'tts_done' / verdict 'PASS …'
--
-- FROM 절 없이 스칼라 서브쿼리만 쓴다 — 대상 행이 없어도 반드시 1행을 돌려주기
-- 위해서다(빈 결과로 끝나면 실패 사유가 화면에 남지 않는다).
-- -----------------------------------------------------------------------------
SELECT
  (SELECT count(*)          FROM _restore_before)              AS rows_matched,
  (SELECT max(status_before) FROM _restore_before)             AS status_before,
  (SELECT count(*) FROM _restore_before
    WHERE status_before = 'in_review')                         AS updated_rows,
  (SELECT r.status FROM public.book_review r
    WHERE r.book_id = '56027756-fc5d-45f9-8b8c-fe33727e6089')  AS status_after,
  CASE
    WHEN (SELECT count(*) FROM _restore_before) <> 1
      THEN 'FAIL — book_review 행이 1행이 아니다. 워커에게 전달할 것'
    WHEN (SELECT max(status_before) FROM _restore_before) = 'in_review'
     AND (SELECT r.status FROM public.book_review r
           WHERE r.book_id = '56027756-fc5d-45f9-8b8c-fe33727e6089') = 'tts_done'
      THEN 'PASS — 1행 원복됨. ROLLBACK을 COMMIT으로 고쳐 재실행할 것'
    WHEN (SELECT max(status_before) FROM _restore_before) = 'tts_done'
      THEN 'SKIP — 이미 tts_done이다. 원복 불필요(UPDATE 0행). COMMIT 하지 말 것'
    ELSE 'FAIL — 사전 상태가 in_review가 아니다(조건부 UPDATE가 건너뜀). 워커에게 전달할 것'
  END                                                          AS verdict;


ROLLBACK;   -- ← 기대값 일치 시 COMMIT 으로 고쳐 재실행
