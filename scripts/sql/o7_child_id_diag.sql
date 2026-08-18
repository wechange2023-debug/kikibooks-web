-- =============================================================================
-- o7_child_id_diag.sql — ADR-0059 O-7 완독 1건의 적립 대상 child_id 추적 (2026-08-18)
--
-- ★ 조회 전용. INSERT/UPDATE/DELETE/DDL 0건. 포인트 보정 구문 0건. ★
--    규율에 따라 BEGIN … ROLLBACK 으로 감쌌다. 쓰기 문장이 없으므로 잃을 것이 없다.
--
-- 목적  : O-7 Reopen 상태의 남은 의문 하나 — "완독 1건이 어느 child_id로 귀속됐는가".
--         실측 전제(2026-08-18 팀장 `children.points` 직접 조회): 키키주니어 +50 ·
--         초은우 −50 · 나머지 8명 차이 0 → **차이 합계 0(총량 보존)**. 적립 로직 자체는
--         정상으로 보이므로, 이 파일은 **귀속 경로만** 본다. 값을 고치지 않는다.
--
-- ★ 포인트 값 수동 보정 금지 — 원인 미확정 상태에서 숫자를 맞추면 재발 감지 수단이
--   사라진다. 이 파일에는 보정 SQL을 두지 않으며, 별도로 만들지도 않는다.
--
-- 실행법: 파일 전체를 SQL Editor에 붙여넣고 한 번에 실행한다. 결과 표 6개(Q1~Q6).
--         마지막 ROLLBACK 까지 함께 실행할 것. COMMIT 은 쓰지 않는다.
--
-- 스키마 근거 (추측 아님 — 저장소 실측)
-- -----------------------------------------------------------------------------
--   · children(id, parent_id, name, age, current_level, points, created_at, updated_at)
--     — supabase/migrations/001_initial_schema.sql:37-48
--   · reading_sessions(id, child_id, book_id, started_at, completed_at, pages_read,
--     is_completed) — supabase/migrations/001_initial_schema.sql:121-130
--   · 완독 1회당 +50 : `POINTS_PER_COMPLETION = 50` — lib/book/rewards.ts:64
--     (쓰기 경로는 lib/book/rewards.ts:112-117 한 곳뿐)
--   · 001 이후 마이그레이션에 두 테이블의 컬럼 변경(ALTER … ADD/DROP COLUMN)은 없다.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- [Q1] 자녀별 실측 대조표 — 왜: points 와 "완독건수 × 50"의 차이를 자녀 전원에 대해
--      한 표로 본다. 차이 0인 자녀도 숨기지 않는다(8명이 0이라는 사실 자체가 적립
--      로직 정상의 근거이므로, 그 근거가 이번 조회에서도 재현되는지 확인해야 한다).
-- -----------------------------------------------------------------------------
WITH completed AS (
  SELECT child_id, COUNT(*) AS completed_count
  FROM reading_sessions
  WHERE is_completed = TRUE
  GROUP BY child_id
)
SELECT
  c.id                                        AS child_id,
  c.name                                      AS child_name,
  c.points                                    AS points_actual,
  COALESCE(d.completed_count, 0)              AS completed_count,
  COALESCE(d.completed_count, 0) * 50         AS points_expected,
  c.points - COALESCE(d.completed_count, 0) * 50 AS points_diff,
  c.created_at                                AS child_created_at
FROM children c
LEFT JOIN completed d ON d.child_id = c.id
ORDER BY c.created_at ASC;

-- -----------------------------------------------------------------------------
-- [Q2] 차이 ≠ 0 인 자녀만 — 왜: Q1 에서 어긋난 행만 좁혀 본다. 현재 예상은 2행
--      (키키주니어 +50 / 초은우 −50)이나, 예상과 다른 행 수·자녀가 나오면 그것이
--      새 사실이다. 예상에 맞추지 말고 나온 그대로 읽는다.
-- -----------------------------------------------------------------------------
WITH completed AS (
  SELECT child_id, COUNT(*) AS completed_count
  FROM reading_sessions
  WHERE is_completed = TRUE
  GROUP BY child_id
)
SELECT
  c.id                                        AS child_id,
  c.name                                      AS child_name,
  c.points                                    AS points_actual,
  COALESCE(d.completed_count, 0)              AS completed_count,
  COALESCE(d.completed_count, 0) * 50         AS points_expected,
  c.points - COALESCE(d.completed_count, 0) * 50 AS points_diff
FROM children c
LEFT JOIN completed d ON d.child_id = c.id
WHERE c.points - COALESCE(d.completed_count, 0) * 50 <> 0
ORDER BY points_diff DESC;

-- -----------------------------------------------------------------------------
-- [Q3] 완독 세션 전량 목록 — 왜: 귀속을 행 단위로 눈으로 좇기 위한 원본이다.
--      인수인계 기준 완독 52행 규모라 전량 출력해도 부담이 없다. LIMIT 500 은
--      절단 목적이 아니라, 규모 가정이 틀렸을 때(500행 도달) 드러나게 하는 표식이다.
-- -----------------------------------------------------------------------------
SELECT
  s.id            AS session_id,
  s.child_id      AS child_id,
  c.name          AS child_name,
  s.book_id       AS book_id,
  s.started_at    AS started_at,
  s.completed_at  AS completed_at
FROM reading_sessions s
LEFT JOIN children c ON c.id = s.child_id
WHERE s.is_completed = TRUE
ORDER BY s.completed_at ASC NULLS LAST
LIMIT 500;

-- -----------------------------------------------------------------------------
-- [Q4] 동일 book_id 를 서로 다른 child_id 가 완독한 건 — 왜: 프로필 전환 중 귀속이
--      뒤바뀐 흔적이 있는지 본다. 같은 책의 완독 행이 2개 이상인 book_id 를 묶어
--      child_id 목록과 함께 낸다. 서로 다른 자녀 수(distinct_child_count)가 2 이상인
--      행이 관심 대상이다.
-- -----------------------------------------------------------------------------
WITH completed AS (
  SELECT s.book_id, s.child_id, s.completed_at, c.name AS child_name
  FROM reading_sessions s
  LEFT JOIN children c ON c.id = s.child_id
  WHERE s.is_completed = TRUE
)
SELECT
  book_id,
  COUNT(*)                                       AS completed_rows,
  COUNT(DISTINCT child_id)                       AS distinct_child_count,
  ARRAY_AGG(child_id ORDER BY completed_at ASC)  AS child_ids,
  ARRAY_AGG(child_name ORDER BY completed_at ASC) AS child_names,
  MIN(completed_at)                              AS first_completed_at,
  MAX(completed_at)                              AS last_completed_at
FROM completed
GROUP BY book_id
HAVING COUNT(*) >= 2
ORDER BY distinct_child_count DESC, completed_rows DESC;

-- -----------------------------------------------------------------------------
-- [Q5] 시간적으로 근접한 완독 쌍 — 왜: 한 번의 완독 처리가 두 자녀에 걸쳐 기록됐는지
--      본다. completed_at 기준 5분 이내이면서 child_id 가 서로 다른 쌍만 낸다.
--      같은 쌍이 두 번 나오지 않도록 (시각, id) 순서로 한 방향만 취한다.
-- -----------------------------------------------------------------------------
WITH done AS (
  SELECT s.id, s.child_id, s.book_id, s.completed_at, c.name AS child_name
  FROM reading_sessions s
  LEFT JOIN children c ON c.id = s.child_id
  WHERE s.is_completed = TRUE
    AND s.completed_at IS NOT NULL
)
SELECT
  a.completed_at                            AS completed_at_a,
  a.child_id                                AS child_id_a,
  a.child_name                              AS child_name_a,
  a.book_id                                 AS book_id_a,
  b.completed_at                            AS completed_at_b,
  b.child_id                                AS child_id_b,
  b.child_name                              AS child_name_b,
  b.book_id                                 AS book_id_b,
  b.completed_at - a.completed_at           AS gap
FROM done a
JOIN done b
  ON a.child_id <> b.child_id
 AND b.completed_at >= a.completed_at
 AND b.completed_at <= a.completed_at + INTERVAL '5 minutes'
 AND (b.completed_at > a.completed_at OR a.id < b.id)
ORDER BY a.completed_at ASC;

-- -----------------------------------------------------------------------------
-- [Q6] 행 수 대조 — 왜: 인수인계 수치(reading_sessions 56행 · 완독 52행 · 자녀 10명)와
--      맞는지 본다. 어긋나면 그 자체가 새 사실이며, Q1~Q5 의 해석도 다시 봐야 한다.
-- -----------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM reading_sessions)                            AS reading_sessions_total,
  (SELECT COUNT(*) FROM reading_sessions WHERE is_completed = TRUE)  AS reading_sessions_completed,
  (SELECT COUNT(*) FROM children)                                    AS children_total;

ROLLBACK;
