-- =============================================================================
-- author_missing_audit.sql — books.author 누락 규모 총량 집계 (2026-08-18)
--
-- ★ 조회 전용. INSERT/UPDATE/DELETE/DDL 0건. ★
--    규율에 따라 BEGIN … ROLLBACK 으로 감쌌다. 쓰기 문장이 없으므로 ROLLBACK 해도
--    잃을 것이 없고, 실수로 COMMIT 해도 DB는 바뀌지 않는다.
--
-- 목적  : "원본 출처에 저자 정보가 없어서 비운 것"과 "적재 스크립트 파싱 실패"가 DB상
--         구분되지 않으므로, 먼저 **규모를 숫자로 확보**한다. 개별 도서 조사는 하지 않는다.
--         저자 공란 자체는 정당한 처리이며 라이선스 위반이 아니다(attribution_text는
--         NOT NULL이라 어트리뷰션 자체는 항상 존재한다 — Hard Rule 1).
-- 실행법: 파일 전체를 SQL Editor에 붙여넣고 한 번에 실행한다. 결과 표 3개.
--
-- 컬럼 정의 실측 (supabase/migrations/001_initial_schema.sql:92-93, DB 조회 0건)
-- -----------------------------------------------------------------------------
--   author       TEXT   -- NULL 허용, DEFAULT 없음
--   illustrator  TEXT   -- NULL 허용, DEFAULT 없음
--   이후 마이그레이션(002~009)에서 두 컬럼에 대한 변경 0건.
--
-- 누락이 NULL 로 들어가는가 빈 문자열('')로 들어가는가 — 적재 스크립트 실측
-- -----------------------------------------------------------------------------
--   NULL 로 넣는 경로 (`or None` 관용구):
--     scripts/sync_book_dash.py:169   "author": (creator or "").strip() or None
--     scripts/sync_gdl.py:336         "author": raw_author or None
--     scripts/sync_asb.py:284,308     author = ... .strip() or None
--     scripts/sync_bloom.py:576-583   extract_author() → 후보 없으면 return None
--   빈 문자열('')이 들어갈 수 있는 경로 (**`or None` 가드 없음**):
--     scripts/sync_book_dash_v2.py:700-701  "author": creators.get("writer")
--       ← fetch_creators()(:322-349)가 `html.unescape(name).strip()`을 그대로 담는다.
--         정규식이 공백뿐인 이름을 잡으면 strip 결과가 ''가 되어 그대로 적재된다.
--   ⇒ **혼재 가능**하므로 판정은 `author IS NULL OR btrim(author) = ''` 양쪽을 모두 잡는다.
--
-- ★ 센티널 주의 — ASB 는 삽화가 누락을 NULL 이 아니라 '미상' 문자열로 적재한다
--   (scripts/sync_asb.py:93 ILLUSTRATOR_UNKNOWN = '미상', :309에서 대입).
--   따라서 NULL/'' 만으로 세면 ASB 분이 통째로 빠진다. 구획 ③이 이 센티널 건수를
--   **별도 열**로 함께 보여주므로, 누락으로 셀지 여부는 숫자를 보고 팀장이 판단한다.
--   (본 SQL은 지시서 문언대로 NULL/''만 '누락'으로 집계하고, 센티널은 참고 열이다.)
--
-- 참고: GDL 은 ASb 콘텐츠의 **publisher 를 author 로** 저장한다
--   (scripts/sync_asb.py:94 GDL_ASB_AUTHOR = 'African Storybook'). 개인 저자가 아니지만
--   NULL 이 아니므로 '저자 있음'으로 집계된다. 총량 해석 시 감안할 것.
--
-- 관련: docs/guidelines/license-rules.md · Hard Rule 1(attribution_text NOT NULL)
-- 작성: 2026-08-18 워커 / 기준 HEAD ccb36d3
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- ① 출처별 × 저자 유무 — 활성 도서(is_active = true)만
--    missing_pct 가 높은 출처가 파싱 실패를 의심할 1순위다.
-- -----------------------------------------------------------------------------
WITH active AS (
  SELECT
    b.source_platform,
    (b.author IS NULL OR btrim(b.author) = '') AS author_missing
  FROM public.books AS b
  WHERE b.is_active = true
)
SELECT
  a.source_platform,
  count(*)                                     AS active_books,
  count(*) FILTER (WHERE a.author_missing)     AS author_missing,
  count(*) FILTER (WHERE NOT a.author_missing) AS author_present,
  round(
    100.0 * count(*) FILTER (WHERE a.author_missing) / nullif(count(*), 0),
    1
  )                                            AS missing_pct
FROM active AS a
GROUP BY a.source_platform
ORDER BY author_missing DESC, a.source_platform;


-- -----------------------------------------------------------------------------
-- ② 전체 요약 1행 — 활성 총 도서 수 / 저자 누락 수 / 누락 비율
-- -----------------------------------------------------------------------------
WITH active AS (
  SELECT
    (b.author IS NULL OR btrim(b.author) = '') AS author_missing
  FROM public.books AS b
  WHERE b.is_active = true
)
SELECT
  'ALL(active)'                                AS scope,
  count(*)                                     AS active_books,
  count(*) FILTER (WHERE a.author_missing)     AS author_missing,
  round(
    100.0 * count(*) FILTER (WHERE a.author_missing) / nullif(count(*), 0),
    1
  )                                            AS missing_pct
FROM active AS a;


-- -----------------------------------------------------------------------------
-- ③ 저자·삽화가 **둘 다** 누락인 활성 도서 수 (출처별)
--
--    both_missing              author·illustrator 가 모두 NULL 또는 ''
--    illustrator_missing       illustrator 만 기준 (NULL/'')
--    illustrator_unknown_kr    illustrator = '미상' 센티널 (ASB 적재분) — 참고 열.
--                              이 값이 크면 ③의 both_missing 은 **과소 집계**다.
-- -----------------------------------------------------------------------------
WITH active AS (
  SELECT
    b.source_platform,
    (b.author IS NULL OR btrim(b.author) = '')           AS author_missing,
    (b.illustrator IS NULL OR btrim(b.illustrator) = '') AS illustrator_missing,
    (btrim(coalesce(b.illustrator, '')) = '미상')         AS illustrator_unknown_kr
  FROM public.books AS b
  WHERE b.is_active = true
)
SELECT
  a.source_platform,
  count(*)                                                                AS active_books,
  count(*) FILTER (WHERE a.author_missing AND a.illustrator_missing)      AS both_missing,
  count(*) FILTER (WHERE a.author_missing)                                AS author_missing,
  count(*) FILTER (WHERE a.illustrator_missing)                           AS illustrator_missing,
  count(*) FILTER (WHERE a.illustrator_unknown_kr)                        AS illustrator_unknown_kr
FROM active AS a
GROUP BY a.source_platform
ORDER BY both_missing DESC, a.source_platform;


-- -----------------------------------------------------------------------------
-- 리허설 종료. 쓰기 0건이므로 되돌릴 것도 없다.
-- -----------------------------------------------------------------------------
ROLLBACK;
