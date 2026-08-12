-- 06_final_verify.sql — 3 step COMMIT 후 최종 검증 (읽기 전용)
-- 생성: scripts/tts_pilot/gen_book_audio_sql_708.py (워커, DB 접속 0건)
-- 근거: ADR-0053 D4(전량 확장) / ADR-0034(결정 ①②③ + Amd#1 kind · Amd#2 성우 층위)
--       / ADR-0052 D5(page_index 축) · Amd#2(rate 의미) · D8(워커 DB 직접 쓰기 금지)
--
-- ★ 쓰기문 0건 — 전부 SELECT. 반복 실행해도 안전하다.
-- ★ 실행 시점: 03 / 04 / 05 머지를 모두 COMMIT 한 뒤.
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
-- [3] 플랫폼별 분포
-- ============================================================
-- 기대:
--   african_storybook  신규 books  527 · rows  5855
--   bloom              신규 books  142 · rows  1616
--   book_dash          신규 books   39 · rows   507 + 기존 128권 = 167권
--   ※ 기존 128권(pilot12+fullbatch116)은 전부 Book Dash라 book_dash 행에 합산된다.
--     book_dash 기대 = 39 + 128 = 167권 / 507 + 1614 = 2121행
SELECT b.source_platform,
       count(DISTINCT a.book_id)                 AS books,
       count(*)                                  AS row_count,
       count(*) FILTER (WHERE a.kind = 'page')   AS page_rows,
       count(*) FILTER (WHERE a.kind = 'cover')  AS cover_rows
  FROM public.book_audio a JOIN public.books b ON b.id = a.book_id
 WHERE a.voice = 'danielle'
 GROUP BY b.source_platform ORDER BY b.source_platform;

-- ============================================================
-- [4] 무결성 — 전부 0
-- ============================================================
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
-- [5] UNIQUE 키 중복 · page_index 연속성
-- ============================================================
-- 기대: dup_unique_key 0 / gap_books 0
SELECT
  (SELECT count(*) FROM (SELECT 1 FROM public.book_audio
      GROUP BY book_id, kind, page_index, voice HAVING count(*) > 1) t)
                                                       AS dup_unique_key,
  (SELECT count(*) FROM (SELECT a.book_id FROM public.book_audio a
     WHERE a.voice = 'danielle' AND a.kind = 'page' GROUP BY a.book_id
      HAVING max(a.page_index) <> count(*) - 1 OR min(a.page_index) <> 0) t)
                                                       AS gap_books;

-- ============================================================
-- [6] 종합 판정
-- ============================================================
SELECT CASE WHEN
     (SELECT count(DISTINCT book_id) FROM public.book_audio WHERE voice = 'danielle') = 836
 AND (SELECT count(*) FROM public.book_audio WHERE voice = 'danielle') = 9592
 AND (SELECT count(*) FROM public.book_audio WHERE voice = 'danielle' AND kind = 'page') = 8756
 AND (SELECT count(*) FROM public.book_audio WHERE voice = 'danielle' AND kind = 'cover') = 836
 AND (SELECT count(*) FROM public.book_audio WHERE voice = 'Ruth') = 574
 AND (SELECT count(*) FROM (SELECT 1 FROM public.book_audio
       GROUP BY audio_path HAVING count(*) > 1) t) = 0
 AND (SELECT count(*) FROM public.book_audio WHERE duration_ms IS NULL) = 0
 AND (SELECT count(*) FROM public.book_audio
       WHERE voice = 'danielle'
         AND (audio_path LIKE 'book-audio/%' OR audio_path NOT LIKE '%/danielle/%')) = 0
 AND (SELECT count(*) FROM (SELECT book_id FROM public.book_audio
        WHERE voice = 'danielle' GROUP BY book_id
         HAVING count(*) FILTER (WHERE kind = 'cover') = 0) t) = 0
  THEN 'PASS — 적재 완료. 07_staging_drop 로 정리 가능'
  ELSE 'FAIL — 위 [1]~[5] 수치를 워커에게 전달할 것'
  END AS verdict;

-- ============================================================
-- [7] 참고 — 본 적재 범위 밖 (쓰기 없음)
-- ============================================================
-- ⚠ books.has_audio 갱신과 book_review.status 전이는 본 적재에 **포함하지 않았다**.
--   앱은 has_audio 를 읽지 않고 book_audio 행 존재로 판정하므로
--   (lib/book/audio-manifest.ts) 화면 영향이 없다. 필요 시 별도 판단 후 실행.
SELECT count(*) AS danielle_books_has_audio_false
  FROM public.books b
 WHERE b.has_audio = false
   AND b.id IN (SELECT DISTINCT book_id FROM public.book_audio WHERE voice = 'danielle');

SELECT r.status, count(*) AS books
  FROM public.book_review r
 WHERE r.book_id IN (SELECT DISTINCT book_id FROM public.book_audio WHERE voice = 'danielle')
 GROUP BY r.status ORDER BY r.status;

-- ┌──────────────────────────────────────────────────────────┐
-- │ 06 최종 기대값 대조표 — 팀장 확인용
-- ├──────────────────────────────────────────────────────────┤
-- │ [1] danielle books  836 rows  9592 page  8756 cover  836
-- │ [2] danielle 836권 9592행 · Ruth 44권 574행 · 총 10166행
-- │ [3] asb 527권 5855행 · bloom 142권 1616행 · book_dash 167권 2121행
-- │ [4] 무결성 6개 항목 전부 0
-- │ [5] dup_unique_key 0 · gap_books 0
-- │ [6] verdict = PASS
-- ├──────────────────────────────────────────────────────────┤
-- │ 다음: 07_staging_drop
-- └──────────────────────────────────────────────────────────┘
