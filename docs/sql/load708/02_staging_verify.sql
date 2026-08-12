-- 02_staging_verify.sql — staging 전량 게이트 (읽기 전용)
-- 생성: scripts/tts_pilot/gen_book_audio_sql_708.py (워커, DB 접속 0건)
-- 근거: ADR-0053 D4(전량 확장) / ADR-0034(결정 ①②③ + Amd#1 kind · Amd#2 성우 층위)
--       / ADR-0052 D5(page_index 축) · Amd#2(rate 의미) · D8(워커 DB 직접 쓰기 금지)
--
-- ★ 쓰기문 0건 — 전부 SELECT. 반복 실행해도 안전하다.
-- ★ 실행 시점: 01_chunk_01 ~ 마지막 청크를 모두 실행한 뒤.
-- ★ 맨 아래 verdict 가 'PASS' 여야만 03 머지로 넘어간다. FAIL이면 머지 금지.
--
-- 기대 총량: 708권 / 7978행 (page 7270 + cover 708)

-- ============================================================
-- [1] 총량
-- ============================================================
-- 기대: staged_rows 7978 / staged_books 708 / page 7270 / cover 708
SELECT count(*)                                       AS staged_rows,
       count(DISTINCT (source_platform, source_id))   AS staged_books,
       count(*) FILTER (WHERE kind = 'page')          AS page_rows,
       count(*) FILTER (WHERE kind = 'cover')         AS cover_rows
  FROM public.book_audio_staging_708;

-- ============================================================
-- [2] 청크별 적재 확인 — 빠진 청크 찾기
-- ============================================================
-- 기대:
--   chunk  1 →  779행
--   chunk  2 →  786행
--   chunk  3 →  786행
--   chunk  4 →  785행
--   chunk  5 →  787행
--   chunk  6 →  783행
--   chunk  7 →  777행
--   chunk  8 →  694행
--   chunk  9 →  607행
--   chunk 10 →  597행
--   chunk 11 →  571행
--   chunk 12 →   26행
SELECT chunk_no, count(*) AS rows_loaded
  FROM public.book_audio_staging_708 GROUP BY chunk_no ORDER BY chunk_no;

-- ============================================================
-- [3] 플랫폼별 분포
-- ============================================================
-- 기대:
--   african_storybook  books  527 · rows  5855 (page 5328 + cover 527)
--   bloom              books  142 · rows  1616 (page 1474 + cover 142)
--   book_dash          books   39 · rows   507 (page 468 + cover 39)
SELECT source_platform,
       count(DISTINCT source_id)                AS books,
       count(*)                                 AS rows_staged,
       count(*) FILTER (WHERE kind = 'page')    AS page_rows,
       count(*) FILTER (WHERE kind = 'cover')   AS cover_rows
  FROM public.book_audio_staging_708 GROUP BY source_platform ORDER BY source_platform;

-- ============================================================
-- [4] 무결성 — 전부 0
-- ============================================================
-- 기대: dup_unit_key 0 / dup_audio_path 0 / null_duration 0 / null_marks 0 / bad_path 0
SELECT
  (SELECT count(*) FROM (SELECT 1 FROM public.book_audio_staging_708
      GROUP BY source_platform, source_id, kind, page_index HAVING count(*) > 1) t)
                                                     AS dup_unit_key,
  (SELECT count(*) FROM (SELECT 1 FROM public.book_audio_staging_708
      GROUP BY audio_path HAVING count(*) > 1) t)    AS dup_audio_path,
  (SELECT count(*) FROM public.book_audio_staging_708 WHERE duration_ms IS NULL) AS null_duration,
  (SELECT count(*) FROM public.book_audio_staging_708 WHERE marks_path IS NULL)  AS null_marks,
  (SELECT count(*) FROM public.book_audio_staging_708
    WHERE audio_path LIKE 'book-audio/%'
       OR audio_path NOT LIKE '%/danielle/%')         AS bad_path;

-- ============================================================
-- [5] book_id 매핑 — (source_platform, source_id) → books.id
-- ============================================================
-- 기대: mapped_books 708 / unmapped_rows 0 / mismatched_rows 0
SELECT
  (SELECT count(DISTINCT b.id)
     FROM public.book_audio_staging_708 s JOIN public.books b
       ON b.source_platform = s.source_platform AND b.source_id = s.source_id)
                                                     AS mapped_books,
  (SELECT count(*) FROM public.book_audio_staging_708 s WHERE NOT EXISTS (
      SELECT 1 FROM public.books b
       WHERE b.source_platform = s.source_platform AND b.source_id = s.source_id))
                                                     AS unmapped_rows,
  (SELECT count(*) FROM public.book_audio_staging_708 s JOIN public.books b
       ON b.source_platform = s.source_platform AND b.source_id = s.source_id
    WHERE b.id <> s.manifest_book_id)                AS mismatched_rows;

-- ============================================================
-- [6] 기존 행 충돌 — (book_id, kind, page_index, voice) 및 audio_path
-- ============================================================
-- 기대: conflict_unique 0 / conflict_audio_path 0
-- ※ 03~05 머지를 이미 COMMIT 한 뒤 이 파일을 다시 돌리면 여기서 0이 아니게 나온다.
--   그건 정상이다(이미 적재됐다는 뜻). 머지 **전에** 0인지가 관문이다.
SELECT
  (SELECT count(*) FROM public.book_audio_staging_708 s
     JOIN public.books b
       ON b.source_platform = s.source_platform AND b.source_id = s.source_id
     JOIN public.book_audio a
       ON a.book_id = b.id AND a.kind = s.kind
      AND a.page_index = s.page_index AND a.voice = 'danielle')
                                                     AS conflict_unique,
  (SELECT count(*) FROM public.book_audio_staging_708 s
     JOIN public.book_audio a ON a.audio_path = s.audio_path)
                                                     AS conflict_audio_path;

-- ============================================================
-- [7] 종합 판정 — 이 한 줄만 보면 된다
-- ============================================================
SELECT CASE WHEN
     (SELECT count(*) FROM public.book_audio_staging_708) = 7978
 AND (SELECT count(DISTINCT (source_platform, source_id)) FROM public.book_audio_staging_708) = 708
 AND (SELECT count(*) FROM public.book_audio_staging_708 WHERE kind = 'page')  = 7270
 AND (SELECT count(*) FROM public.book_audio_staging_708 WHERE kind = 'cover') = 708
 AND (SELECT count(*) FROM (SELECT 1 FROM public.book_audio_staging_708
       GROUP BY source_platform, source_id, kind, page_index HAVING count(*) > 1) t) = 0
 AND (SELECT count(*) FROM public.book_audio_staging_708 WHERE duration_ms IS NULL) = 0
 AND (SELECT count(*) FROM public.book_audio_staging_708 WHERE marks_path IS NULL) = 0
 AND (SELECT count(*) FROM public.book_audio_staging_708
       WHERE audio_path LIKE 'book-audio/%' OR audio_path NOT LIKE '%/danielle/%') = 0
 AND (SELECT count(*) FROM public.book_audio_staging_708 s WHERE NOT EXISTS (
       SELECT 1 FROM public.books b
        WHERE b.source_platform = s.source_platform AND b.source_id = s.source_id)) = 0
 AND (SELECT count(*) FROM public.book_audio_staging_708 s JOIN public.books b
        ON b.source_platform = s.source_platform AND b.source_id = s.source_id
      WHERE b.id <> s.manifest_book_id) = 0
 AND (SELECT count(*) FROM public.book_audio_staging_708 s
        JOIN public.books b
          ON b.source_platform = s.source_platform AND b.source_id = s.source_id
        JOIN public.book_audio a
          ON a.book_id = b.id AND a.kind = s.kind
         AND a.page_index = s.page_index AND a.voice = 'danielle') = 0
 AND (SELECT count(*) FROM public.book_audio_staging_708 s
        JOIN public.book_audio a ON a.audio_path = s.audio_path) = 0
  THEN 'PASS — 03_merge_step1_asb 로 진행 가능'
  ELSE 'FAIL — 머지 금지. 위 [1]~[6] 수치를 워커에게 전달할 것'
  END AS verdict;

-- ┌──────────────────────────────────────────────────────────┐
-- │ 02 기대값 대조표 — 팀장 확인용
-- ├──────────────────────────────────────────────────────────┤
-- │ [1] staged_rows 7978 · staged_books 708 · page 7270 · cover 708
-- │ [2] 청크 12개 전부 존재, 각 기대 행 수 일치
-- │ [3] asb 527권 5855행 · bloom 142권 1616행 · book_dash 39권 507행
-- │ [4] 무결성 5개 항목 전부 0
-- │ [5] mapped_books 708 · unmapped 0 · mismatched 0
-- │ [6] conflict_unique 0 · conflict_audio_path 0
-- │ [7] verdict = PASS
-- ├──────────────────────────────────────────────────────────┤
-- │ 다음: 03_merge_step1_asb
-- └──────────────────────────────────────────────────────────┘
