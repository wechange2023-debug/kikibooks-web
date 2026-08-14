-- =============================================================================
-- 06_probe_rollback_semantics.sql
--   SQL Editor에서 BEGIN … ROLLBACK 이 실제로 쓰기를 되돌리는가 (가설 A/B 판별)
--
-- 배경   : 04_restore_… 가 `42P01: relation "_restore_before" does not exist` 로
--          2회 실패했다. 문법은 정상(실 PostgreSQL 파서 검증 통과)이므로 원인은
--          실행 환경이며 후보가 둘이다.
--            가설 A — 문장 단위 자동 커밋. `ON COMMIT DROP`이 CREATE 문장 직후 발동.
--                     ⇒ **BEGIN … ROLLBACK 이 무력**하다. 프로젝트 전체의
--                        "리허설 후 COMMIT 타이핑" 규약이 허상이 된다.
--            가설 B — 연결 풀(트랜잭션 모드). 임시 표는 세션 로컬이라 다음 문장에서
--                     안 보인다. ⇒ 트랜잭션은 정상. 규약 안전.
--          어느 쪽인지에 따라 대응 범위가 완전히 달라지므로 먼저 판별한다.
--
-- 실행자 : 팀장 (Supabase SQL Editor). 워커 DB 직접 쓰기 금지(ADR-0053 D6-①).
-- 대상   : book_dash-catch-that-cat / book_id 56027756-fc5d-45f9-8b8c-fe33727e6089
--          현재 상태 confirmed (텍스트 복원 후 화면 '확정' 버튼으로 정상 전이됨)
--
-- 무해성 근거
-- -----------------------------------------------------------------------------
--   · 쓰기는 book_review 1행의 status 컬럼뿐. confirmed → in_review 는 둘 다
--     5상태 CHECK 제약 안의 정상 값이며, 화면 전이표에도 있는 정규 전이다.
--   · book_audio · Storage · book_text 접촉 0건. 오디오 자산은 영향받지 않는다.
--   · 최악의 경우(가설 A 참)에도 상태가 in_review로 남을 뿐이며, 화면 '확정'
--     버튼(정상 전이 in_review → confirmed)으로 즉시 복구된다.
--   · [실행 2]는 읽기 전용이다.
--
-- ★ 실행 방법 — 두 블록을 **따로** 실행한다. 순서가 실험의 전부다.
--     ① [실행 1] 블록만 드래그 선택해 실행 → 결과 5컬럼을 기록
--        (이 블록 자체가 BEGIN … ROLLBACK 이므로 블록째 선택하면 트랜잭션은 온전하다)
--     ② [실행 2] 블록만 드래그 선택해 실행 → status 값을 기록
--   두 블록을 한 번에 실행하면 [실행 1]의 결과가 화면에서 밀려 판정 근거가 사라진다.
-- =============================================================================


-- =============================================================================
-- [실행 1] 트랜잭션 안에서 1행을 실제로 바꾸고, 바꿨다는 사실을 확인한 뒤 되돌린다
--
--   조건부 UPDATE + 사전 상태 확보를 단일 SELECT 문장의 CTE로 처리한다(04의
--   임시 표 방식이 실패했으므로 그 의존을 쓰지 않는다).
--
--   ★ updated_rows 를 반드시 확인해야 하는 이유:
--     UPDATE가 0행을 건드렸는데 [실행 2]에서 confirmed가 나오면 "ROLLBACK이
--     작동했다"고 **잘못** 읽게 된다(애초에 쓴 적이 없으므로). updated_rows = 1
--     이 확인돼야 [실행 2]의 결과가 의미를 가진다.
--
-- 기대: rows_matched 1 / status_before 'confirmed' / updated_rows 1
--       status_in_txn 'in_review' / probe_ready 'READY — [실행 2]로 진행할 것'
-- =============================================================================
BEGIN;

WITH before AS (
  SELECT status AS status_before
    FROM public.book_review
   WHERE book_id = '56027756-fc5d-45f9-8b8c-fe33727e6089'
),
upd AS (
  UPDATE public.book_review
     SET status = 'in_review'
   WHERE book_id = '56027756-fc5d-45f9-8b8c-fe33727e6089'
     AND status = 'confirmed'
  RETURNING status AS status_new
)
SELECT
  (SELECT count(*)           FROM before)          AS rows_matched,
  (SELECT max(status_before) FROM before)          AS status_before,
  (SELECT count(*)           FROM upd)             AS updated_rows,
  coalesce((SELECT max(status_new)    FROM upd),
           (SELECT max(status_before) FROM before)) AS status_in_txn,
  CASE
    WHEN (SELECT count(*) FROM before) <> 1
      THEN 'ABORT — book_review 행이 1행이 아니다. 실험 중단, 워커에게 전달할 것'
    WHEN (SELECT count(*) FROM upd) = 1
      THEN 'READY — 1행을 바꿨다. 이 블록은 ROLLBACK으로 끝난다. [실행 2]로 진행할 것'
    WHEN (SELECT max(status_before) FROM before) = 'in_review'
      THEN 'ABORT — 이미 in_review다. 화면 확정 버튼으로 confirmed로 만든 뒤 재실행할 것'
    ELSE 'ABORT — 사전 상태가 confirmed가 아니다(UPDATE 0행). 실험 무효, 워커에게 전달할 것'
  END                                              AS probe_ready;

ROLLBACK;   -- ← 실험용이다. 이 파일의 ROLLBACK은 **절대 COMMIT으로 고치지 말 것**


-- =============================================================================
-- [실행 2] 위 트랜잭션이 끝난 뒤의 실제 상태 (읽기 전용)
--
-- 판정
--   status = 'confirmed'  → ROLLBACK 작동 = **가설 B**. 규약 안전.
--                           07_restore_…_v3.sql 로 진행한다.
--   status = 'in_review'  → 되돌지 않음  = **가설 A**. 자동 커밋이다.
--                           07을 실행하지 말고 즉시 워커에게 알릴 것.
--                           (복구: 화면 '확정' 버튼으로 confirmed 복귀)
--   ※ [실행 1]의 updated_rows가 1이 아니었다면 이 결과는 판정 근거가 되지 못한다.
-- =============================================================================
SELECT status AS status_after_rollback
  FROM public.book_review
 WHERE book_id = '56027756-fc5d-45f9-8b8c-fe33727e6089';
