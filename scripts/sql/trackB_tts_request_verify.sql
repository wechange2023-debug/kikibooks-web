-- =============================================================================
-- trackB_tts_request_verify.sql — 트랙 B 17권 TTS 요청 상태 실측
--
-- ★ 읽기 전용 조회. 팀장이 SQL Editor에서 실행한다. ★
--
-- 목적  : 합성 착수 전, 17권의 DB 상태를 실측으로 확정한다.
--         팀장 보고("교정 → 확정 → TTS 생성 요청 완료")는 조작 완료까지가 사실이며,
--         DB 상태는 본 조회로 확인한다.
-- 성격  : SELECT 1문. INSERT/UPDATE/DELETE 0건. 트랜잭션 미사용(BEGIN·COMMIT 없음).
--         반복 실행해도 DB가 바뀌지 않는다.
-- 실행법: 파일 전체를 SQL Editor에 붙여넣고 한 번에 실행한다. 결과는 단일 표 1개(17행).
--
-- 대상 (워커 로컬 실측 2026-08-18)
-- -----------------------------------------------------------------------------
--   lib/admin/review/rotation-pages.ts ROTATED_PAGES 키 18개에서
--   catch-that-cat 1권을 뺀 **17권**. 목록은 그 상수에서 기계 생성했다(손입력 0건).
--   catch-that-cat 제외 사유: book_audio 보유(has_audio=true) → 요청 버튼 잠김.
--   교정·합성 선후 판별 중 — scripts/sql/trackB_catchthatcat_audit.sql 소관.
--   조인은 (source_platform='book_dash', source_id=slug) 쌍이다(ADR-0047 D1).
--
-- 검증 목적 3가지 — 결과 열만 보고 판정할 수 있게 구성했다
-- -----------------------------------------------------------------------------
--   ① 17권 전부 tts_requested 인가
--        → status_ok 열이 전부 true 인가. all_status_ok 열이 한 번에 답한다.
--   ② book_audio 행이 0인가
--        → audio_rows 전부 0 인가. all_audio_zero 열이 한 번에 답한다.
--   ③ 합성 대상 총 면 수·총 문자 수
--        → grand_pages / grand_chars 열(모든 행에 같은 값이 반복 표시된다).
--   verdict 열은 행 단위 결론이고, gate 열은 17권 전체 결론이다.
--
-- ★ 문자 수 해석 주의
-- -----------------------------------------------------------------------------
--   여기의 chars_total 은 book_text.text 의 **원문 문자 수 그대로**다.
--   Polly 과금 문자 수는 처리기의 정제(sanitize) 결과라 이 값과 다를 수 있다.
--   과금 기준 문자 수는 process_tts_requests.py 드라이런 출력이 정본이다.
--
-- 읽는 법
-- -----------------------------------------------------------------------------
--   book_id 가 NULL 인 행     → books 매칭 실패(정상이면 17행 전부 값 있음).
--   review_status 가 NULL     → book_review 행 없음.
--   audio_rows > 0 인 행      → 그 권은 재합성 트랙이다. 합성 착수 전 STOP.
--   pages_total 이 0 인 행    → book_text 미적재. 합성할 본문이 없다.
--
-- ★ 게이트의 유효 시점 — 합성 '전' 기준이다 (2026-08-18 추가)
-- -----------------------------------------------------------------------------
--   본 SQL의 gate 열은 **합성 착수 전 상태 검증용**이다.
--     통과 조건: status = 'tts_requested' AND audio_rows = 0
--   따라서 합성·적재가 끝난 뒤 다시 실행하면 조건이 반전돼 **GATE FAIL 로 출력되는
--   것이 정상**이다. 실패가 아니다.
--
--   합성·적재 완료 후의 판정 기준은 아래로 바뀐다:
--     · review_status = 'tts_done' 17권
--     · audio_rows 합계 221
--     · is_active 17권 전부 true
--
--   2026-08-18 실행분은 이 **사후 기준으로 PASS** 판정됐다
--   (팀장 실행: gate 열 GATE FAIL 출력 · 사후 기준 3항목 전건 충족 ·
--    grand_books 17 · grand_pages 238 · 권별 audio_rows 가 업로드 보고와 전건 일치).
-- =============================================================================

WITH target(slug) AS (
  VALUES
    ('how-do-you-eat'::text),
    ('how-do-you-sleep'),
    ('khaya-wants-to-row'),
    ('monkey-business'),
    ('my-dream-in-the-drawer'),
    ('pako-the-pigeon-disappears'),
    ('samoosas'),
    ('shhhhh'),
    ('tejus-shadow'),
    ('the-best-gift'),
    ('the-box'),
    ('the-monster-must-go'),
    ('theres-a-fire-on-the-mountain'),
    ('theres-an-alien-in-my-house'),
    ('thulis-tissue'),
    ('whats-happened-to-our-water'),
    ('you-yes-you')
),
b AS (
  SELECT t.slug, bk.id, bk.title, bk.is_active
    FROM target t
    LEFT JOIN public.books bk
      ON bk.source_platform = 'book_dash'
     AND bk.source_id       = t.slug
),
agg AS (
  SELECT
    b.slug,
    b.id                                   AS book_id,
    b.title,
    b.is_active,
    r.status                               AS review_status,
    r.reviewed_at                          AS review_reviewed_at,
    COALESCE((SELECT count(*)                    FROM public.book_text  x WHERE x.book_id = b.id), 0) AS pages_total,
    COALESCE((SELECT sum(char_length(x.text))    FROM public.book_text  x WHERE x.book_id = b.id), 0) AS chars_total,
             (SELECT max(x.updated_at)           FROM public.book_text  x WHERE x.book_id = b.id)     AS text_updated_max,
    COALESCE((SELECT count(*)                    FROM public.book_audio x WHERE x.book_id = b.id), 0) AS audio_rows
    FROM b
    LEFT JOIN public.book_review r ON r.book_id = b.id
)
SELECT
  a.book_id,
  a.slug                                        AS source_id,
  a.title,
  a.review_status,
  a.review_reviewed_at,
  a.pages_total,
  a.chars_total,
  a.text_updated_max,
  a.audio_rows,
  a.is_active,

  -- ① 상태 판정
  (a.review_status = 'tts_requested')           AS status_ok,
  -- ② 오디오 미보유 판정
  (a.audio_rows = 0)                            AS audio_zero,

  CASE
    WHEN a.book_id IS NULL              THEN 'STOP — books 매칭 실패'
    WHEN a.pages_total = 0              THEN 'STOP — book_text 0면(합성할 본문 없음)'
    WHEN a.audio_rows > 0               THEN 'STOP — 오디오 보유(재합성 트랙, ADR-0058 Amd#1 G6)'
    WHEN a.review_status IS NULL        THEN 'STOP — book_review 행 없음'
    WHEN a.review_status <> 'tts_requested'
                                        THEN 'STOP — status=' || a.review_status || ' (요청 미완)'
    ELSE 'OK — 합성 대상'
  END                                           AS verdict,

  -- ③ 17권 전체 합계 (모든 행에 동일 값 반복)
  count(*)          OVER ()                     AS grand_books,
  sum(a.pages_total) OVER ()                    AS grand_pages,
  sum(a.chars_total) OVER ()                    AS grand_chars,
  bool_and(a.review_status = 'tts_requested') OVER ()  AS all_status_ok,
  bool_and(a.audio_rows = 0)                  OVER ()  AS all_audio_zero,

  CASE
    WHEN count(*) OVER () = 17
     AND bool_and(a.book_id IS NOT NULL)                OVER ()
     AND bool_and(a.pages_total > 0)                    OVER ()
     AND bool_and(a.review_status = 'tts_requested')    OVER ()
     AND bool_and(a.audio_rows = 0)                     OVER ()
    THEN 'GATE PASS — 17권 전부 tts_requested · 오디오 0 · 본문 보유'
    ELSE 'GATE FAIL — verdict 열에서 STOP 행을 확인할 것'
  END                                           AS gate
  FROM agg a
 ORDER BY a.slug;

-- =============================================================================
-- 끝. 쓰기문 0건. 이 파일은 DB 상태를 바꾸지 않는다.
-- =============================================================================
