-- =============================================================================
-- 07_restore_tts_done_catch_that_cat_v3.sql
--   줄바꿈 변경 실험 후 book_review 상태 원복 (confirmed → tts_done) · v3
--
-- 근거 ADR: ADR-0058 D2(5상태 제약) · D3(전이표) · D6(tts_done 표기는 SQL 몫)
-- 실행자  : 팀장 (Supabase SQL Editor). 워커 DB 직접 쓰기 금지(ADR-0053 D6-①).
-- 대상    : book_dash-catch-that-cat / book_id 56027756-fc5d-45f9-8b8c-fe33727e6089
--
-- 왜 SQL이어야 하는가
-- -----------------------------------------------------------------------------
--   화면 전이표(lib/admin/review/actions.ts ALLOWED_TRANSITIONS)에는
--   **confirmed → tts_done 이 없다**. 어떤 상태에서도 tts_done으로 가는 전이가
--   없으며, tts_done 표기는 적재 SQL의 조건부 UPDATE만이 만든다(ADR-0058 D6).
--   따라서 이 파일이 원복의 유일한 경로다.
--
-- v1·v2와의 차이
-- -----------------------------------------------------------------------------
--   v1(04) 임시 표 방식 → SQL Editor에서 42P01 실패(문장 사이 생존 불가).
--   v2(05) 사전 상태를 in_review로 가정 → 팀장이 텍스트 복원 후 화면 '확정'을
--          눌러 정상 전이(in_review → confirmed)가 일어나 **전제가 바뀌었다**.
--   v3(이 파일) v2의 CTE 구조를 그대로 쓰되 **사전 상태 기준을 confirmed로** 맞췄다.
--
-- ★ 실행 순서: 06_probe_rollback_semantics.sql 로 판별 → 워커 보고 → 이 파일.
--   06에서 **가설 A(자동 커밋)** 로 판정됐다면 이 파일을 실행하지 말 것.
--   ROLLBACK이 무력한 환경에서는 리허설 없이 곧바로 쓰기가 확정된다.
--
-- ★ 선행 조건: book_text.text가 실험 전 원문으로 복원돼 있을 것(팀장 확인 완료).
--   텍스트를 고친 채 tts_done으로 표기하면, marks 좌표와 어긋난 책이 '음성완료'로
--   기록돼 하이라이트 밀림이 정상 상태로 둔갑한다.
--
-- ★ 실행 방법: 전체를 한 번에 실행한다(블록 분할 실행 금지).
--   기대값이 맞으면 맨 끝 ROLLBACK을 COMMIT으로 직접 고쳐 타이핑한 뒤 재실행한다
--   (ADR-0053 E9 규약).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- [1] 사전 상태 확보 + 조건부 UPDATE + 후검증 — 전부 단일 SELECT 문장
--
--   before : UPDATE 이전 상태. 같은 문장 안의 WITH 하위 구문은 동일 스냅샷을 보므로
--            UPDATE의 효과가 섞이지 않는다(PostgreSQL 문서화 동작). 임시 표 불요.
--   upd    : 조건부 UPDATE. status='confirmed'인 경우에만 1행을 건드린다.
--            조건부인 이유 — 다른 상태(in_review·tts_requested 등)로 새어 있으면
--            덮어쓰지 않는다. 잘못된 상태를 '완료'로 봉인하는 사고를 막는 장치다.
--            RETURNING은 **변경 후** 값을 돌려주므로 updated_rows는 실제 영향 행수다.
--
--   바깥 SELECT는 FROM 절 없이 스칼라 서브쿼리만 쓴다 — 대상 행이 없어도 반드시
--   1행을 돌려주기 위해서다(빈 결과로 끝나면 실패 사유가 화면에 남지 않는다).
--
-- 기대: rows_matched 1 / status_before 'confirmed' / updated_rows 1
--       status_after 'tts_done' / verdict 'PASS …'
-- -----------------------------------------------------------------------------
WITH before AS (
  SELECT status AS status_before
    FROM public.book_review
   WHERE book_id = '56027756-fc5d-45f9-8b8c-fe33727e6089'
),
upd AS (
  UPDATE public.book_review
     SET status = 'tts_done'
   WHERE book_id = '56027756-fc5d-45f9-8b8c-fe33727e6089'
     AND status = 'confirmed'
  RETURNING status AS status_new
)
SELECT
  (SELECT count(*)           FROM before)          AS rows_matched,
  (SELECT max(status_before) FROM before)          AS status_before,
  (SELECT count(*)           FROM upd)             AS updated_rows,
  coalesce((SELECT max(status_new)    FROM upd),
           (SELECT max(status_before) FROM before)) AS status_after,
  CASE
    WHEN (SELECT count(*) FROM before) <> 1
      THEN 'FAIL — book_review 행이 1행이 아니다. 워커에게 전달할 것'
    WHEN (SELECT max(status_before) FROM before) = 'confirmed'
     AND (SELECT count(*) FROM upd) = 1
      THEN 'PASS — 1행 원복됨. ROLLBACK을 COMMIT으로 고쳐 재실행할 것'
    WHEN (SELECT max(status_before) FROM before) = 'tts_done'
      THEN 'SKIP — 이미 tts_done이다. 원복 불필요(UPDATE 0행). COMMIT 하지 말 것'
    ELSE 'FAIL — 사전 상태가 confirmed가 아니다(조건부 UPDATE가 건너뜀). 워커에게 전달할 것'
  END                                              AS verdict;


ROLLBACK;   -- ← 기대값 일치 시 COMMIT 으로 고쳐 재실행
