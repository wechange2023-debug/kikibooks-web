-- =============================================================================
-- trackB_final_verify.sql — 트랙 B 회전 18권 33면 최종 적재 검증
--
-- ★ 읽기 전용 조회. 팀장이 SQL Editor에서 실행한다. ★
--
-- 목적  : 회전 트랙 전체(18권)의 최종 상태를 한 표로 확정한다.
--         17권 배치(run 20260818-144217) + catch-that-cat 재합성(run 20260818-152853)
--         두 적재가 모두 반영됐는지 독립 검증한다.
-- 성격  : SELECT 1문. INSERT/UPDATE/DELETE 0건. 트랜잭션 미사용(BEGIN·COMMIT 없음).
--         반복 실행해도 DB가 바뀌지 않는다.
-- 실행법: 파일 전체를 SQL Editor에 붙여넣고 한 번에 실행한다. 결과는 단일 표 1개(18행).
--
-- 대상 (워커 로컬 실측 2026-08-18)
-- -----------------------------------------------------------------------------
--   lib/admin/review/rotation-pages.ts ROTATED_PAGES 키 **18권 전체**
--   (catch-that-cat 포함 — 앞선 trackB_tts_request_verify.sql 의 17권과 다르다).
--   target 목록·권별 회전면 수는 그 상수에서 기계 생성했다(손입력 0건).
--   조인은 (source_platform='book_dash', source_id=slug) 쌍이다(ADR-0047 D1).
--
-- 통과 기준 (gate 열이 한 번에 답한다)
-- -----------------------------------------------------------------------------
--   ① 18권 전부 review_status = 'tts_done'
--   ② audio_rows 합계 = **234**  ( 17권 221 + catch-that-cat 13 )
--   ③ is_active 18권 전부 true
--   ④ books 매칭 결손 0 (book_id NULL 행 없음)
--
-- ★ 이 SQL의 게이트는 **적재 완료 후** 기준이다
-- -----------------------------------------------------------------------------
--   합성 전 상태 검증은 scripts/sql/trackB_tts_request_verify.sql 소관이며
--   그쪽 게이트는 status='tts_requested' AND audio_rows=0 이다. 시점이 반대다.
--
-- 읽는 법
-- -----------------------------------------------------------------------------
--   verdict 열 = 행 단위 결론 / gate 열 = 18권 전체 결론(모든 행에 같은 값).
--   rotated_pages 열은 그 권의 회전 대상 면 수다(합계 33 — 참고값, 게이트 아님).
-- =============================================================================

WITH target(slug, rotated_pages) AS (
  VALUES
    ('catch-that-cat'::text, 1::int),
    ('how-do-you-eat', 1),
    ('how-do-you-sleep', 5),
    ('khaya-wants-to-row', 3),
    ('monkey-business', 5),
    ('my-dream-in-the-drawer', 1),
    ('pako-the-pigeon-disappears', 1),
    ('samoosas', 1),
    ('shhhhh', 3),
    ('tejus-shadow', 1),
    ('the-best-gift', 1),
    ('the-box', 1),
    ('the-monster-must-go', 2),
    ('theres-a-fire-on-the-mountain', 1),
    ('theres-an-alien-in-my-house', 1),
    ('thulis-tissue', 1),
    ('whats-happened-to-our-water', 3),
    ('you-yes-you', 1)
),
b AS (
  SELECT t.slug, t.rotated_pages, bk.id, bk.title, bk.is_active
    FROM target t
    LEFT JOIN public.books bk
      ON bk.source_platform = 'book_dash'
     AND bk.source_id       = t.slug
),
agg AS (
  SELECT
    b.slug, b.rotated_pages, b.id AS book_id, b.title, b.is_active,
    r.status                                                                     AS review_status,
    r.reviewed_at                                                                AS review_reviewed_at,
    COALESCE((SELECT count(*) FROM public.book_audio x WHERE x.book_id = b.id), 0) AS audio_rows,
    COALESCE((SELECT count(*) FROM public.book_text  x WHERE x.book_id = b.id), 0) AS pages_total
    FROM b
    LEFT JOIN public.book_review r ON r.book_id = b.id
)
SELECT
  a.book_id,
  a.slug                                        AS source_id,
  a.title,
  a.review_status,
  a.review_reviewed_at,
  a.audio_rows,
  a.rotated_pages,
  a.pages_total,
  a.is_active,

  CASE
    WHEN a.book_id IS NULL                 THEN 'FAIL — books 매칭 실패'
    WHEN a.review_status IS DISTINCT FROM 'tts_done'
                                           THEN 'FAIL — status=' || COALESCE(a.review_status, '(없음)')
    WHEN a.audio_rows = 0                  THEN 'FAIL — book_audio 0행(적재 누락)'
    WHEN a.is_active IS NOT TRUE           THEN 'FAIL — is_active 아님'
    ELSE 'OK — 적재 완료'
  END                                           AS verdict,

  -- 전체 합계 (모든 행에 동일 값 반복)
  count(*)               OVER ()                AS grand_books,
  sum(a.audio_rows)      OVER ()                AS grand_audio_rows,
  sum(a.rotated_pages)   OVER ()                AS grand_rotated_pages,
  sum(a.pages_total)     OVER ()                AS grand_pages,

  CASE
    WHEN count(*) OVER () = 18
     AND bool_and(a.book_id IS NOT NULL)                  OVER ()
     AND bool_and(a.review_status = 'tts_done')           OVER ()
     AND bool_and(a.is_active)                            OVER ()
     AND sum(a.audio_rows) OVER () = 234
    THEN 'GATE PASS — 18권 tts_done · audio 234행 · is_active 전부 true'
    ELSE 'GATE FAIL — verdict 열에서 FAIL 행과 grand_audio_rows(기대 234)를 확인할 것'
  END                                           AS gate
  FROM agg a
 ORDER BY a.slug;

-- =============================================================================
-- 끝. 쓰기문 0건. 이 파일은 DB 상태를 바꾸지 않는다.
-- =============================================================================
