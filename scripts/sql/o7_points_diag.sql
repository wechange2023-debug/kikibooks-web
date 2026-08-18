-- =============================================================================
-- o7_points_diag.sql — ADR-0059 O-7 `children.points` 초과분 원인 판별 (2026-08-18)
--
-- ★ 조회 전용. INSERT/UPDATE/DELETE/DDL 0건. children 쓰기 구문 0건. ★
--    규율에 따라 BEGIN … ROLLBACK 으로 감쌌다. 쓰기 문장이 없으므로 잃을 것이 없다.
--
-- 목적  : 화면 실측(2026-08-18 팀장) — 완독 **45권** · 포인트 **2,650P** · 읽는 중 3권.
--         45 × 50 = 2,250P 이므로 **400P(= 8회분)** 가 초과다. 그 400P가 어디서 왔는지
--         **판별**한다. 값을 고치지 않는다. 적립 로직도 고치지 않는다.
-- 실행법: 파일 전체를 SQL Editor에 붙여넣고 한 번에 실행한다. 결과 표 4개(R1~R4).
--         R1 이 핵심이며 나머지는 R1 의 해석을 가르는 보조 조회다.
--
-- 코드 실측으로 이미 좁혀 놓은 사실 (추정 아님 — 2026-08-18 저장소 전수)
-- -----------------------------------------------------------------------------
--   · `children.points` 를 쓰는 코드는 **한 곳뿐**이다:
--     `lib/book/rewards.ts:112-117` — `points = current.points + 50` UPDATE.
--     `POINTS_PER_COMPLETION = 50`(:75). 호출자는 `completeReadingSession` 하나뿐이며,
--     `reading_sessions` 1행 UPDATE 성공(= 완독 전이) 직후에만 부른다.
--   · 마이그레이션 전체에 **points 를 건드리는 트리거·함수는 없다**
--     (001 의 트리거 2종은 `enforce_commercial_license`(books)·`touch_updated_at`(updated_at)).
--     `points INT NOT NULL DEFAULT 0 CHECK (points >= 0)`(001:44-45)가 컬럼 정의의 전부다.
--   · 온보딩의 `children` INSERT(`app/onboarding/actions.ts:60-65`)는 points 를 넣지 않는다
--     → DEFAULT 0 으로 시작한다.
--   · 배지 부여(`child_badges` upsert)는 **포인트를 주지 않는다**(rewards.ts:120-127).
--   · 따라서 **포인트 = 완독 전이 횟수 × 50** 이 코드상의 유일한 규칙이다.
--     ★ 여기서 "완독 전이 횟수"는 **완독 세션 행수**이지 **완독 책 종수가 아니다.**
--       ADR-0018 D5 가 "매 완독 +50", rewards.ts 주석이 "재독 시 새 reading_session 의
--       완독 전이마다 +50 누적"을 박제한다. 화면의 "완독 45권"은 ADR-0024 O2 의
--       **종수** 정의라 애초에 포인트와 같은 단위가 아니다.
--
-- 가설과 판별 기준 — **어느 것이 정답인지 본 파일은 단정하지 않는다**
-- -----------------------------------------------------------------------------
--   H1. 재완독(같은 책 2회 이상 완독)이 종수-기준 기대치를 초과시킨다. [설계상 정상]
--       확정 조건: R1 의 `diff_vs_rows = 0` 이고 `recompletion_rows × 50` 이 400P 를 설명.
--       R2 가 그 재완독 건을 도서 단위로 열거한다.
--   H2. 완독 UPDATE 의 멱등성 부재로 같은 세션이 중복 가산됐다.
--       확정 조건: R1 의 `diff_vs_rows > 0`. 즉 완독 **행수**로도 설명이 안 되는 잔액.
--       (코드상 UPDATE 는 `completed_at IS NULL` 로 좁혀 0행이면 보상을 안 부르므로
--        같은 행의 2회 가산은 어렵다. 잔액이 있으면 코드 밖 경로를 의심해야 한다.)
--   H3. 비활성 처리된 도서의 과거 완독분이 포인트에는 남아 있다.
--       확정 조건: R4 의 `rows_on_inactive_books > 0`. 화면 "완독 권수"는 비활성 도서를
--       빼지 않지만 '읽은 책' **목록**은 뺀다 — 수치와 목록의 괴리도 여기서 보인다.
--   H4. 관리자 프리뷰 세션 정리(purge)로 세션은 줄었는데 포인트는 회수되지 않았다.
--       확정 조건: R1 의 `diff_vs_rows > 0` **이면서** R3 의 완독 분포가
--       2026-07-28(관리자 목록→리더 링크 도입 커밋 5bd84c8) 이후에 몰려 있을 때.
--       ※ 다만 정리 기준 B(`scripts/sql/cleanup/purge_admin_preview_sessions.sql`)는
--         `is_completed = false` 행만 지운다. 미완독 세션은 애초에 포인트를 준 적이
--         없으므로, **기준 B 정리만으로는 H4 가 성립하지 않는다** — 완독 행이 지워진
--         이력이 따로 있어야 한다.
--   H5. 배지 등 완독 외 별도 적립 경로.
--       확정 조건: R1 의 `badge_rows` 와 잔액이 같은 배수로 움직일 때.
--       ※ 코드 실측상 배지는 포인트를 주지 않으므로 사전 가능성은 낮다.
--
--   판별의 1차 분기는 단 하나다 — **R1 의 `diff_vs_rows` 가 0 인가 아닌가.**
--     0 이면 H1 만으로 전부 설명되고 코드는 설계대로 동작한 것이다(수치 정의 문제).
--     0 이 아니면 그 잔액이 진짜 O-7 이며 H2~H5 로 좁혀 들어간다.
--
-- 2026-08-15 선행 실측 (ADR-0059 §1·O-7): 키키주니어 완독 세션 **52행** / 완독 종수 45 /
--   points 2,650 → 52×50 = 2,600 이라 그때는 **+50** 이 남았다. 본 조회는 그 이후 변화까지
--   포함한 **현재값**을 다시 잰다. 52→53 이 됐다면 잔액은 0 이 된다.
--
-- 관련: docs/adr/0059-reading-sessions-row-cap.md O-7 · docs/adr/0018-completion-rewards-and-library.md D5
-- 작성: 2026-08-18 워커 / 기준 HEAD ccb36d3
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- R1. 자녀별 정합표 — **핵심**. 어느 수치와 points 가 맞는지 한 행에서 보인다.
--
--   diff_vs_rows    = points − (완독 세션 행수 × 50)   ← 코드 규칙 기준. **0 이어야 정상**
--   diff_vs_titles  = points − (완독 종수 × 50)        ← 화면 표시 기준. 0 이 아닌 게 정상
--   recompletion_rows = 완독 행수 − 완독 종수          ← 재완독 횟수(H1의 크기)
-- -----------------------------------------------------------------------------
WITH sess AS (
  SELECT
    rs.child_id,
    count(*)                                                  AS session_rows,
    count(*) FILTER (WHERE rs.is_completed)                   AS completed_rows,
    count(DISTINCT rs.book_id) FILTER (WHERE rs.is_completed) AS completed_titles,
    count(*) FILTER (WHERE NOT rs.is_completed)               AS in_progress_rows
  FROM public.reading_sessions AS rs
  GROUP BY rs.child_id
),
badges AS (
  SELECT cb.child_id, count(*) AS badge_rows
  FROM public.child_badges AS cb
  GROUP BY cb.child_id
)
SELECT
  c.name,
  c.points,
  coalesce(s.session_rows, 0)                                      AS session_rows,
  coalesce(s.completed_rows, 0)                                    AS completed_rows,
  coalesce(s.completed_titles, 0)                                  AS completed_titles,
  coalesce(s.in_progress_rows, 0)                                  AS in_progress_rows,
  coalesce(b.badge_rows, 0)                                        AS badge_rows,
  coalesce(s.completed_rows, 0) * 50                               AS expect_by_rows,
  coalesce(s.completed_titles, 0) * 50                             AS expect_by_titles,
  c.points - coalesce(s.completed_rows, 0) * 50                    AS diff_vs_rows,
  c.points - coalesce(s.completed_titles, 0) * 50                  AS diff_vs_titles,
  coalesce(s.completed_rows, 0) - coalesce(s.completed_titles, 0)  AS recompletion_rows,
  c.id                                                             AS child_id
FROM public.children AS c
LEFT JOIN sess   AS s ON s.child_id = c.id
LEFT JOIN badges AS b ON b.child_id = c.id
ORDER BY c.points DESC, c.name;


-- -----------------------------------------------------------------------------
-- R2. 재완독 도서 열거 (H1 의 실체) — 같은 자녀가 같은 책을 2회 이상 완독한 건.
--     extra_points 합계가 R1 의 diff_vs_titles 를 설명하면 H1 이 지지된다.
--     0행이면 H1 은 기각이고 초과분은 다른 곳에서 왔다.
-- -----------------------------------------------------------------------------
WITH dup AS (
  SELECT
    rs.child_id,
    rs.book_id,
    count(*)             AS completed_rows,
    min(rs.completed_at) AS first_completed_at,
    max(rs.completed_at) AS last_completed_at
  FROM public.reading_sessions AS rs
  WHERE rs.is_completed
  GROUP BY rs.child_id, rs.book_id
  HAVING count(*) > 1
)
SELECT
  c.name,
  bk.title,
  d.completed_rows,
  (d.completed_rows - 1) * 50                        AS extra_points,
  d.first_completed_at AT TIME ZONE 'Asia/Seoul'     AS first_kst,
  d.last_completed_at  AT TIME ZONE 'Asia/Seoul'     AS last_kst
FROM dup AS d
JOIN public.children AS c  ON c.id = d.child_id
JOIN public.books    AS bk ON bk.id = d.book_id
ORDER BY d.completed_rows DESC, c.name, bk.title;


-- -----------------------------------------------------------------------------
-- R3. 완독 시기 분포 (H4 보조) — 관리자 목록→리더 링크 도입일 2026-07-28(커밋 5bd84c8)
--     전후로 완독 행이 어떻게 갈리는가. 이후에 몰려 있으면 검수 동선에서 '다 읽었어요'가
--     눌린 흔적을 의심할 수 있다. 고르게 퍼져 있으면 실사용 기록에 가깝다.
-- -----------------------------------------------------------------------------
WITH comp AS (
  SELECT rs.child_id, rs.completed_at
  FROM public.reading_sessions AS rs
  WHERE rs.is_completed
)
SELECT
  c.name,
  count(*)                                                                     AS completed_rows,
  count(*) FILTER (WHERE comp.completed_at <  timestamptz '2026-07-28 00:00+09') AS before_admin_link,
  count(*) FILTER (WHERE comp.completed_at >= timestamptz '2026-07-28 00:00+09') AS on_or_after_admin_link,
  count(*) FILTER (WHERE comp.completed_at IS NULL)                            AS completed_without_ts,
  min(comp.completed_at) AT TIME ZONE 'Asia/Seoul'                             AS oldest_kst,
  max(comp.completed_at) AT TIME ZONE 'Asia/Seoul'                             AS newest_kst
FROM comp
JOIN public.children AS c ON c.id = comp.child_id
GROUP BY c.name
ORDER BY completed_rows DESC, c.name;


-- -----------------------------------------------------------------------------
-- R4. 비활성 도서 완독분 (H3) — 완독은 했으나 지금은 is_active = false 인 책.
--     rows_on_inactive_books > 0 이면 "포인트에는 남고 목록에서는 빠지는" 괴리가 실재한다.
-- -----------------------------------------------------------------------------
WITH comp AS (
  SELECT rs.child_id, rs.book_id, bk.is_active
  FROM public.reading_sessions AS rs
  JOIN public.books AS bk ON bk.id = rs.book_id
  WHERE rs.is_completed
)
SELECT
  c.name,
  count(*)                                                              AS completed_rows,
  count(*) FILTER (WHERE NOT comp.is_active)                            AS rows_on_inactive_books,
  count(DISTINCT comp.book_id)                                          AS completed_titles,
  count(DISTINCT comp.book_id) FILTER (WHERE NOT comp.is_active)        AS titles_on_inactive_books,
  count(*) FILTER (WHERE NOT comp.is_active) * 50                       AS points_from_inactive_books
FROM comp
JOIN public.children AS c ON c.id = comp.child_id
GROUP BY c.name
ORDER BY completed_rows DESC, c.name;


-- -----------------------------------------------------------------------------
-- 리허설 종료. 쓰기 0건이므로 되돌릴 것도 없다.
-- -----------------------------------------------------------------------------
ROLLBACK;
