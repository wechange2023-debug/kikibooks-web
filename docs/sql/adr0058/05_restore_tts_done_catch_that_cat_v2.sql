-- =============================================================================
-- 05_restore_tts_done_catch_that_cat_v2.sql
--   줄바꿈 변경 실험 후 book_review 상태 원복 (in_review → tts_done) · v2
--
-- 근거 ADR: ADR-0058 D2(5상태 제약) · D3(전이표) · D6(tts_done 표기는 적재 SQL 몫)
-- 실행자  : 팀장 (Supabase SQL Editor). 워커 DB 직접 쓰기 금지(ADR-0053 D6-①).
-- 대상    : book_dash-catch-that-cat / book_id 56027756-fc5d-45f9-8b8c-fe33727e6089
--
-- v1(04_…) 실패와 v2의 차이
-- -----------------------------------------------------------------------------
--   04는 사전 상태를 TEMP TABLE에 박제한 뒤 다음 문장에서 읽었다. SQL Editor에서
--   `ERROR 42P01: relation "_restore_before" does not exist`가 2회 재현됐다.
--   문법 자체는 정상이므로(실 PostgreSQL 파서 검증 통과) 원인은 **문장 사이에
--   임시 표가 살아남지 못하는 실행 환경**이다. 임시 표는 세션(연결)에 매이고,
--   `ON COMMIT DROP`은 트랜잭션 경계에서 사라진다 — 둘 중 어느 쪽이든 v1은 깨진다.
--
--   v2는 그 의존을 **구조적으로 제거**한다. 사전 상태 조회·조건부 UPDATE·후검증을
--   **단일 SELECT 문장** 안의 CTE로 합쳤다. 문장이 하나뿐이므로 문장 사이에
--   무엇이 살아남는지에 의존하지 않는다.
--
--   PostgreSQL 보장(문서화된 동작): 같은 문장 안의 WITH 하위 구문들은 **동일한
--   스냅샷**을 본다. `before`는 UPDATE의 효과를 보지 못하므로 실행 순서와 무관하게
--   항상 **UPDATE 이전 상태**를 담는다. `updated_rows`는 UPDATE … RETURNING이
--   실제로 돌려준 행 수이므로 영향 행수 그 자체다.
--
-- ★ 선행 조건: **book_text.text를 실험 전 원문으로 되돌린 뒤** 실행할 것.
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
--   before : UPDATE 이전 상태(동일 스냅샷 보장). 임시 표를 대신한다.
--   upd    : 조건부 UPDATE. status='in_review'인 경우에만 1행을 건드린다.
--            조건부인 이유 — 실험 도중 다른 상태(confirmed·tts_requested 등)로
--            새어 있으면 덮어쓰지 않는다. 잘못된 상태를 '완료'로 봉인하는 사고를
--            막는 장치다. RETURNING은 **변경 후** 값을 돌려준다.
--
--   바깥 SELECT는 FROM 절 없이 스칼라 서브쿼리만 쓴다 — 대상 행이 없어도 반드시
--   1행을 돌려주기 위해서다(빈 결과로 끝나면 실패 사유가 화면에 남지 않는다).
--
-- 기대: rows_matched 1 / status_before 'in_review' / updated_rows 1
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
     AND status = 'in_review'
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
    WHEN (SELECT max(status_before) FROM before) = 'in_review'
     AND (SELECT count(*) FROM upd) = 1
      THEN 'PASS — 1행 원복됨. ROLLBACK을 COMMIT으로 고쳐 재실행할 것'
    WHEN (SELECT max(status_before) FROM before) = 'tts_done'
      THEN 'SKIP — 이미 tts_done이다. 원복 불필요(UPDATE 0행). COMMIT 하지 말 것'
    ELSE 'FAIL — 사전 상태가 in_review가 아니다(조건부 UPDATE가 건너뜀). 워커에게 전달할 것'
  END                                              AS verdict;


ROLLBACK;   -- ← 기대값 일치 시 COMMIT 으로 고쳐 재실행
