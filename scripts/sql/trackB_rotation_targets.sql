-- =============================================================================
-- trackB_rotation_targets.sql — 트랙 B 회전 페이지 교정 대상 조회
--
-- ★ 읽기 전용 조회. 팀장이 SQL Editor에서 실행한다. ★
--
-- 목적  : 회전(직교회전) 대상 면의 현재 상태를 한 표로 확정한다.
--         책 식별자(book_id)·제목·플랫폼·대상 면 번호·검수 상태·오디오 보유 여부.
-- 성격  : SELECT 1문. INSERT/UPDATE/DELETE 0건. 트랜잭션 미사용(BEGIN·COMMIT 없음).
--         반복 실행해도 DB가 바뀌지 않는다.
-- 실행법: 파일 전체를 SQL Editor에 붙여넣고 한 번에 실행한다. 결과는 단일 표 1개(33행).
--
-- 대상의 출처 (워커 로컬 실측 2026-08-18)
-- -----------------------------------------------------------------------------
--   lib/admin/review/rotation-pages.ts 의 ROTATED_PAGES 상수 = 직교회전 33면 / 18권.
--   같은 값이 scripts/tts_pilot/tts_targets.py ROTATED_SLUGS(18권) ·
--   docs/sql/adr0054/02_rot18_pol6_state_audit.sql(rotated 18행) ·
--   scratchpad/rotation_audit_154.csv 재계산(18권 33면)과 일치한다.
--   본 파일의 target 목록은 그 상수에서 기계 생성했다(손입력 0건).
--
-- 좌표계 (중요)
-- -----------------------------------------------------------------------------
--   page_index = 0-based. book_text.page_index 축이다(ADR-0046 D2).
--   page_no    = page_index + 1 = 1-based. 검수 화면이 "NN면"으로 표시하는 값이며
--                (components/admin/review/review-detail-view.tsx:325)
--                scratchpad/rotation_audit_154.csv 의 page_no 와 같은 축이다.
--   팀장이 화면에서 찾을 때 쓰는 번호는 page_no 다.
--
-- 식별자
-- -----------------------------------------------------------------------------
--   이 코호트(Book Dash PDF 152/154)의 books.source_id 는 slug 다(ADR-0047 D1).
--   조인은 (source_platform='book_dash', source_id=slug) 쌍으로 건다.
--
-- 읽는 법
-- -----------------------------------------------------------------------------
--   book_id 가 NULL 인 행  → books 매칭 실패. 워커에게 알릴 것(정상이면 33행 전부 값 있음).
--   review_status 가 NULL → book_review 행 없음. 검수 화면에 그 책이 뜨지 않는다.
--   has_audio = true      → TTS 생성 요청 버튼이 잠긴다(ADR-0058 D4 재생성 차단).
--   text_row_exists=false → 그 면의 book_text 행이 없다. 화면에서 교정할 칸이 없다.
-- =============================================================================

WITH target(slug, page_index) AS (
  VALUES
    ('catch-that-cat'::text, 4::int),
    ('how-do-you-eat', 11),
    ('how-do-you-sleep', 2),
    ('how-do-you-sleep', 4),
    ('how-do-you-sleep', 6),
    ('how-do-you-sleep', 7),
    ('how-do-you-sleep', 9),
    ('khaya-wants-to-row', 2),
    ('khaya-wants-to-row', 5),
    ('khaya-wants-to-row', 11),
    ('monkey-business', 5),
    ('monkey-business', 6),
    ('monkey-business', 7),
    ('monkey-business', 8),
    ('monkey-business', 10),
    ('my-dream-in-the-drawer', 12),
    ('pako-the-pigeon-disappears', 6),
    ('samoosas', 11),
    ('shhhhh', 0),
    ('shhhhh', 1),
    ('shhhhh', 11),
    ('tejus-shadow', 9),
    ('the-best-gift', 11),
    ('the-box', 10),
    ('the-monster-must-go', 7),
    ('the-monster-must-go', 9),
    ('theres-a-fire-on-the-mountain', 9),
    ('theres-an-alien-in-my-house', 4),
    ('thulis-tissue', 9),
    ('whats-happened-to-our-water', 4),
    ('whats-happened-to-our-water', 6),
    ('whats-happened-to-our-water', 10),
    ('you-yes-you', 4)
)
SELECT
  b.id                                   AS book_id,
  b.title                                AS title,
  b.source_platform                      AS source_platform,
  t.slug                                 AS source_id,
  t.page_index + 1                       AS page_no,
  t.page_index                           AS page_index,
  r.status                               AS review_status,
  CASE
    WHEN b.id IS NULL THEN NULL
    ELSE EXISTS (
      SELECT 1 FROM public.book_audio a
       WHERE a.book_id = b.id
    )
  END                                    AS has_audio,
  CASE
    WHEN b.id IS NULL THEN NULL
    ELSE EXISTS (
      SELECT 1 FROM public.book_text x
       WHERE x.book_id = b.id
         AND x.page_index = t.page_index
    )
  END                                    AS text_row_exists,
  b.is_active                            AS is_active,
  count(*) OVER (PARTITION BY t.slug)    AS target_pages_in_book,
  count(*) OVER ()                       AS target_pages_total
  FROM target t
  LEFT JOIN public.books b
    ON b.source_platform = 'book_dash'
   AND b.source_id       = t.slug
  LEFT JOIN public.book_review r
    ON r.book_id = b.id
 ORDER BY t.slug, t.page_index;

-- =============================================================================
-- 끝. 쓰기문 0건. 이 파일은 DB 상태를 바꾸지 않는다.
-- =============================================================================
