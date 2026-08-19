-- =============================================================================
-- o7_parent_scope.sql — ADR-0059 O-7 부모 범위 확인 (2026-08-19)
--
-- ★ 조회 전용. INSERT/UPDATE/DELETE/DDL 0건. 포인트 보정 구문 0건. ★
--    규율에 따라 BEGIN … ROLLBACK 으로 감쌌다. 쓰기 문장이 없으므로 잃을 것이 없다.
--
-- 목적  : o7_child_id_diag.sql(Q1~Q6) 실측 이후 남은 의문 하나를 가른다.
--
--   코드 실측(읽기 전용 판독, 2026-08-19)
--     · 활성 자녀는 저장 상태가 아니라 매 요청 서버 조회로 결정된다 —
--       lib/home/active-child.ts:51-57 : parent_id = 본인 AND ORDER BY created_at ASC LIMIT 1.
--     · 자녀 전환 UI는 미구현(lib/home/active-child.ts:11, app/(reader)/mypage/page.tsx:31).
--     · children DELETE 경로 0건. INSERT는 온보딩 1건뿐이며 created_at은 DEFAULT NOW()
--       이므로 후발 자녀가 최선참을 빼앗지 못한다(app/onboarding/actions.ts:60-65).
--     · 세션 쓰기는 2곳뿐 — lib/book/reading-session.ts:155(INSERT)·:213(UPDATE).
--       둘 다 getActiveChild 결과로만 child_id를 정한다.
--
--   따라서 코드상 **한 부모 아래에서는 최선참 자녀 1명만 세션을 가질 수 있다.**
--   그런데 실측은 쵸은우 17건 · 우혀니 16건 · kikikiki 1건의 완독을 보여 준다.
--   → 이 자녀들이 **서로 다른 부모**에 속하면 코드와 모순이 없다.
--     같은 부모에 속하면 **현재 코드 경로로는 생성될 수 없는 행**이라는 뜻이다.
--   Q8이 그 판정 쿼리다.
--
--   ※ created_at 동률로 인한 정렬 비결정성 가설은 **반증됐다** — Q1 실측에서 자녀 10명의
--     created_at이 전부 상이(동률 0건)했다. 같은 조회를 두 번 해도 같은 답이 나온다.
--   ※ 어긋난 완독 1건의 **발생 시점은 아직 특정되지 않았다.** 특정 날짜를 전제하지 않는다.
--
-- ★ 포인트 값 수동 보정 금지 — 원인 미확정 상태에서 숫자를 맞추면 재발 감지 수단이
--   사라진다. 이 파일에는 보정 SQL을 두지 않으며, 별도로 만들지도 않는다.
--
-- 실행법: 파일 전체를 SQL Editor에 붙여넣고 한 번에 실행한다. 결과 표 5개(Q7~Q11).
--         마지막 ROLLBACK 까지 함께 실행할 것. COMMIT은 쓰지 않는다.
--
-- 스키마 근거 (추측 아님 — 저장소 실측)
--   · profiles(id, email, display_name, role, created_at, updated_at)
--     — supabase/migrations/001_initial_schema.sql:21-29
--   · children(id, parent_id, name, age, current_level, points, created_at, updated_at)
--     — supabase/migrations/001_initial_schema.sql:37-48
--   · reading_sessions(id, child_id, book_id, started_at, completed_at, pages_read,
--     is_completed) — supabase/migrations/001_initial_schema.sql:121-130
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- [Q7] 자녀-부모 매핑 — 왜: 이후 모든 판정의 원본이다. 자녀 10명이 부모 몇 명으로
--      갈리는지, 부모별 생성 순서(= getActiveChild의 1순위)가 어떻게 되는지를
--      한 표에서 눈으로 확인한다. parent_id로 묶어 created_at 오름차순으로 낸다.
-- -----------------------------------------------------------------------------
SELECT
  c.parent_id     AS parent_id,
  p.email         AS parent_email,
  c.id            AS child_id,
  c.name          AS child_name,
  c.created_at    AS child_created_at,
  c.points        AS points
FROM children c
LEFT JOIN profiles p ON p.id = c.parent_id
ORDER BY c.parent_id ASC, c.created_at ASC;

-- -----------------------------------------------------------------------------
-- [Q8] ★결정적 질의★ getActiveChild 예상값 vs 실제 세션 보유 자녀 — 왜: 부모별
--      created_at 최소 자녀(= 코드가 반환할 유일한 자녀)와, 실제로 세션을 가진 자녀를
--      대조한다. matches_first_child = false 행이 하나라도 나오면 **그 세션은 현재 코드
--      경로로는 생성될 수 없었던 행**이다(앱 밖 경로 시사). 전부 true면 코드와 데이터가
--      모순되지 않으며, 자녀들이 서로 다른 부모 소속이라는 뜻이다.
--      ※ 정렬 타이브레이크로 id를 덧붙였으나 Q1 실측상 created_at 동률은 0건이라
--        결과에 영향이 없다(재현성 확보 목적).
-- -----------------------------------------------------------------------------
WITH first_child AS (
  SELECT DISTINCT ON (c.parent_id)
    c.parent_id                          AS parent_id,
    c.id                                 AS first_child_id,
    c.name                               AS first_child_name,
    c.created_at                         AS first_child_created_at
  FROM children c
  ORDER BY c.parent_id ASC, c.created_at ASC, c.id ASC
),
session_owner AS (
  SELECT
    c.parent_id                                        AS parent_id,
    c.id                                               AS child_id,
    c.name                                             AS child_name,
    COUNT(*) FILTER (WHERE s.is_completed = TRUE)      AS completed_count,
    COUNT(*)                                           AS session_count_total
  FROM reading_sessions s
  JOIN children c ON c.id = s.child_id
  GROUP BY c.parent_id, c.id, c.name
)
SELECT
  f.parent_id                       AS parent_id,
  f.first_child_name                AS first_child_name,
  f.first_child_created_at          AS first_child_created_at,
  o.child_name                      AS session_child_name,
  o.completed_count                 AS completed_count,
  o.session_count_total             AS session_count_total,
  (o.child_id = f.first_child_id)   AS matches_first_child
FROM session_owner o
JOIN first_child f ON f.parent_id = o.parent_id
ORDER BY f.parent_id ASC, matches_first_child ASC, o.completed_count DESC;

-- -----------------------------------------------------------------------------
-- [Q9] 부모 계정 수 요약 — 왜: "자녀 10명이 부모 몇 명에 걸쳐 있는가"를 수치로 고정한다.
--      부모가 1명이면 Q8의 불일치가 필연이고, 여러 명이면 부모별 최선참 규칙만으로
--      설명될 여지가 생긴다. distinct 부모 수는 모든 행에 같은 값으로 붙여 함께 읽는다.
-- -----------------------------------------------------------------------------
SELECT
  (SELECT COUNT(DISTINCT parent_id) FROM children)   AS distinct_parent_count,
  c.parent_id                                        AS parent_id,
  COUNT(DISTINCT c.id)                               AS child_count,
  COUNT(s.id)                                        AS session_count_total,
  COUNT(s.id) FILTER (WHERE s.is_completed = TRUE)   AS completed_count
FROM children c
LEFT JOIN reading_sessions s ON s.child_id = c.id
GROUP BY c.parent_id
ORDER BY c.parent_id ASC;

-- -----------------------------------------------------------------------------
-- [Q10] 포인트가 어긋난 두 자녀의 부모 동일 여부 — 왜: +50(a) / −50(b)이 같은 부모
--       아래에서 벌어진 일인지 가른다. 부모가 다르면 앱 코드 경로로는 포인트가 자녀
--       사이를 넘을 수 없다(세션·포인트 모두 로그인한 본인 세션 범위에서 결정된다).
--       child_id는 Q2 실측값을 그대로 쓴다(이름 하드코딩 아님).
--       한쪽 id가 없더라도 행이 사라지지 않도록 FULL OUTER JOIN … ON TRUE로 붙인다
--       — 그 경우 NULL로 드러나는 것 자체가 새 사실이다.
-- -----------------------------------------------------------------------------
SELECT
  a.id          AS child_id_a,
  a.name        AS child_name_a,
  a.parent_id   AS parent_id_a,
  a.created_at  AS created_at_a,
  a.points      AS points_a,
  b.id          AS child_id_b,
  b.name        AS child_name_b,
  b.parent_id   AS parent_id_b,
  b.created_at  AS created_at_b,
  b.points      AS points_b,
  (a.parent_id = b.parent_id) AS same_parent
FROM (
  SELECT id, name, parent_id, created_at, points
  FROM children
  WHERE id = '1eb93951-8a1a-4780-b1a0-6b952a0b92af'::uuid
) a
FULL OUTER JOIN (
  SELECT id, name, parent_id, created_at, points
  FROM children
  WHERE id = '6a59544c-58e2-48cb-8f50-297c1c3e8c75'::uuid
) b ON TRUE;

-- -----------------------------------------------------------------------------
-- [Q11] 세션의 부모 정합성 — 왜: 세션을 자녀 경유로 부모까지 끌어올려 부모별 세션 수를
--       집계한다. Q9(자녀 기준)와 수치가 맞는지 교차 검산하고, 자녀가 조인되지 않는
--       세션(orphan_session_rows > 0)이 있으면 그 자체가 새 사실이다.
--       ※ FK(001:123)상 orphan은 나올 수 없다. 나오면 가정이 틀린 것이다.
-- -----------------------------------------------------------------------------
SELECT
  c.parent_id                                      AS parent_id,
  COUNT(*)                                         AS session_rows,
  COUNT(*) FILTER (WHERE s.is_completed = TRUE)    AS completed_rows,
  COUNT(*) FILTER (WHERE s.completed_at IS NULL)   AS in_progress_rows,
  COUNT(DISTINCT s.child_id)                       AS distinct_children_with_sessions,
  COUNT(*) FILTER (WHERE c.id IS NULL)             AS orphan_session_rows
FROM reading_sessions s
LEFT JOIN children c ON c.id = s.child_id
GROUP BY c.parent_id
ORDER BY session_rows DESC;

ROLLBACK;
