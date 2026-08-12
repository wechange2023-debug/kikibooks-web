-- load708_final_verify.sql — step1~3 COMMIT 완료 후 최종 검증 (읽기 전용)
-- 생성: scripts/tts_pilot/gen_book_audio_sql_708.py (워커, DB 접속 0건)
-- 근거: ADR-0053 D4 / ADR-0034 / ADR-0052
--
-- ★ 이 파일에는 INSERT/UPDATE/DELETE가 **없다**. 전부 SELECT — 안전하게 반복 실행 가능.
-- ★ 실행 시점: load708_step1_asb / step2_bloom / step3_bookdash 를 모두 COMMIT 한 뒤.
--
-- 신규 적재분: 708권 / 7978행 (page 7270 + cover 708)
-- 기존 danielle: 128권 / 1614행 (pilot12 + fullbatch116)
-- 최종 danielle: 836권 / 9592행 (page 8756 + cover 836)

-- ============================================================
-- [1] danielle 총계
-- ============================================================
-- 기대: books 836 / rows 9592 / page 8756 / cover 836
SELECT count(DISTINCT book_id) AS danielle_books,
       count(*)                               AS danielle_rows,
       count(*) FILTER (WHERE kind = 'page')  AS page_rows,
       count(*) FILTER (WHERE kind = 'cover') AS cover_rows
  FROM public.book_audio WHERE voice = 'danielle';

-- ============================================================
-- [2] voice별 분포 — 구 Ruth 무간섭 확인
-- ============================================================
-- 기대: danielle 836권 9592행 · Ruth 44권 574행
--       총 10166행 (그 밖의 voice가 나오면 예상 밖 — 보고할 것)
SELECT voice, count(DISTINCT book_id) AS books, count(*) AS row_count
  FROM public.book_audio GROUP BY voice ORDER BY voice;

-- ============================================================
-- [3] 신규 danielle 708권 — 플랫폼별 분포
-- ============================================================
-- 기대:
--   african_storybook  books  527 · rows  5855 (page 5328 + cover 527)
--   bloom              books  142 · rows  1616 (page 1474 + cover 142)
--   book_dash          books   39 · rows   507 (page 468 + cover 39)
-- ※ 이 쿼리는 신규분만 세도록 audio_path의 '/danielle/' 층위와 books 조인을 함께 건다.
--   기존 128권(Book Dash pilot12+fullbatch116)은 slug 기반 경로라 book_dash 행에 섞인다 —
--   그래서 기대값은 book_dash 39 + 128 = 167권이다.
SELECT b.source_platform,
       count(DISTINCT a.book_id)                 AS books,
       count(*)                                  AS row_count,
       count(*) FILTER (WHERE a.kind = 'page')   AS page_rows,
       count(*) FILTER (WHERE a.kind = 'cover')  AS cover_rows
  FROM public.book_audio a JOIN public.books b ON b.id = a.book_id
 WHERE a.voice = 'danielle'
 GROUP BY b.source_platform ORDER BY b.source_platform;

-- ============================================================
-- [4] 무결성 — 전부 0이어야 한다
-- ============================================================
-- 기대: dup_audio_path 0 / null_duration 0 / null_audio_path 0
--       bad_path 0 / books_missing_cover 0 / orphan_book_id 0
SELECT
  (SELECT count(*) FROM (SELECT 1 FROM public.book_audio
      GROUP BY audio_path HAVING count(*) > 1) t)      AS dup_audio_path,
  (SELECT count(*) FROM public.book_audio WHERE duration_ms IS NULL)
                                                       AS null_duration,
  (SELECT count(*) FROM public.book_audio WHERE audio_path IS NULL)
                                                       AS null_audio_path,
  (SELECT count(*) FROM public.book_audio
    WHERE voice = 'danielle'
      AND (audio_path LIKE 'book-audio/%' OR audio_path NOT LIKE '%/danielle/%'))
                                                       AS bad_path,
  (SELECT count(*) FROM (SELECT book_id FROM public.book_audio
     WHERE voice = 'danielle' GROUP BY book_id
      HAVING count(*) FILTER (WHERE kind = 'cover') = 0) t)
                                                       AS books_missing_cover,
  (SELECT count(*) FROM public.book_audio a
    WHERE NOT EXISTS (SELECT 1 FROM public.books b WHERE b.id = a.book_id))
                                                       AS orphan_book_id;

-- ============================================================
-- [5] UNIQUE 키 중복 — (book_id, kind, page_index, voice)
-- ============================================================
-- 기대: 0 (제약이 살아 있으면 구조적으로 0이지만, 제약 유효성 자체를 확인한다)
SELECT count(*) AS dup_unique_key FROM (
  SELECT 1 FROM public.book_audio
   GROUP BY book_id, kind, page_index, voice HAVING count(*) > 1
) t;

-- ============================================================
-- [6] 권별 page_index 연속성 — 신규 708권
-- ============================================================
-- 기대: gap_books 0. page 행의 page_index가 0..(n-1) 연속인지 본다.
--   (매니페스트의 pNN이 연속이었으므로 DB에서도 연속이어야 한다)
SELECT count(*) AS gap_books FROM (
  SELECT a.book_id
    FROM public.book_audio a
   WHERE a.voice = 'danielle' AND a.kind = 'page'
   GROUP BY a.book_id
  HAVING max(a.page_index) <> count(*) - 1 OR min(a.page_index) <> 0
) t;

-- ============================================================
-- [7] 참고 — 후속 작업 판단용 (본 적재 범위 밖)
-- ============================================================
-- ⚠ books.has_audio 갱신과 book_review.status 전이는 본 3 step에 **포함하지 않았다**.
--   앱은 has_audio를 읽지 않고 book_audio 행 존재로 판정하므로(lib/book/audio-manifest.ts)
--   화면에는 영향이 없다. SQL 레벨 정합이 필요하면 별도 판단 후 실행할 것.
-- 현재 상태만 조회한다(쓰기 없음).
SELECT count(*) AS danielle_books_has_audio_false
  FROM public.books b
 WHERE b.has_audio = false
   AND b.id IN (SELECT DISTINCT book_id FROM public.book_audio WHERE voice = 'danielle');

SELECT r.status, count(*) AS books
  FROM public.book_review r
 WHERE r.book_id IN (SELECT DISTINCT book_id FROM public.book_audio WHERE voice = 'danielle')
 GROUP BY r.status ORDER BY r.status;

-- ┌──────────────────────────────────────────────────────────┐
-- │ 최종 기대값 대조표 — 팀장 확인용
-- ├──────────────────────────────────────────────────────────┤
-- │ [1] danielle  books  836  rows  9592  page  8756  cover  836
-- │ [2] voice     danielle  836권  9592행 · Ruth 44권 574행
-- │             book_audio 총 10166행
-- │ [3] 플랫폼별  african_storybook 527권 5855행
-- │             bloom 142권 1616행
-- │             book_dash 167권 2121행 (신규 39 + 기존 128)
-- │ [4] 무결성    dup_audio_path 0 · null_duration 0 · null_audio_path 0
-- │             bad_path 0 · books_missing_cover 0 · orphan_book_id 0
-- │ [5] UNIQUE    dup_unique_key 0
-- │ [6] 연속성    gap_books 0
-- └──────────────────────────────────────────────────────────┘
