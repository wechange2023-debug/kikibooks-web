-- 01_chunk_12.sql — staging 청크 12/12 (실행 순서 13/N)
-- 생성: scripts/tts_pilot/gen_book_audio_sql_708.py (워커, DB 접속 0건)
-- 근거: ADR-0053 D4(전량 확장) / ADR-0034(결정 ①②③ + Amd#1 kind · Amd#2 성우 층위)
--       / ADR-0052 D5(page_index 축) · Amd#2(rate 의미) · D8(워커 DB 직접 쓰기 금지)
--
-- ★ 이 파일은 staging 테이블에만 INSERT 한다. 본 테이블(book_audio) 무접촉.
--   실패하든 두 번 돌리든 본 테이블에는 아무 영향이 없다.
-- ★ 멱등: ON CONFLICT (audio_path) DO NOTHING — 재실행해도 중복이 쌓이지 않는다.
--   재실행하면 INSERT 0 0 이 뜨는데 정상이다(이미 다 들어있다는 뜻).
--   아래 확인 쿼리의 chunk_rows / total_rows 로 판단할 것.
--
-- 이 청크: 2권 / 26행 (page 24 + cover 2)
-- 누적   : 7,978행 / 전체 7,978행
-- 플랫폼 : book_dash
-- 첫 권  : book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66
-- 끝 권  : book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66

INSERT INTO public.book_audio_staging_708
  (chunk_no, source_platform, source_id, manifest_book_id, kind, page_index,
   audio_path, marks_path, duration_ms)
VALUES
  -- book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  (12, 'book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'cover', 0, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 8830),
  (12, 'book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 0, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 4059),
  (12, 'book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 1, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 2210),
  (12, 'book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 2, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 7220),
  (12, 'book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 3, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 5470),
  (12, 'book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 4, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 6890),
  (12, 'book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 5, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 8810),
  (12, 'book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 6, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 5590),
  (12, 'book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 7, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 5040),
  (12, 'book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 8, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 7250),
  (12, 'book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 9, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 3550),
  (12, 'book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 10, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 10270),
  (12, 'book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 11, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 2930),
  -- book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  (12, 'book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'cover', 0, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 9980),
  (12, 'book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 0, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 8880),
  (12, 'book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 1, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 10630),
  (12, 'book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 2, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 9140),
  (12, 'book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 3, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 8830),
  (12, 'book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 4, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 6980),
  (12, 'book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 5, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 5620),
  (12, 'book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 6, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 4420),
  (12, 'book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 7, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 13200),
  (12, 'book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 8, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 8380),
  (12, 'book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 9, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 11090),
  (12, 'book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 10, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 15480),
  (12, 'book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 11, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 7250)
ON CONFLICT (audio_path) DO NOTHING;

-- 확인 (기대: chunk_rows 26 / total_rows 7978)
--   chunk_rows 가 기대보다 작으면 이 청크가 덜 들어간 것 — 다시 실행할 것.
--   total_rows 는 01_chunk_01 부터 순서대로 실행했을 때의 누적값이다.
SELECT count(*) FILTER (WHERE chunk_no = 12) AS chunk_rows,
       count(*)                                AS total_rows
  FROM public.book_audio_staging_708;

-- ┌──────────────────────────────────────────────────────────┐
-- │ 청크 12/12 기대값 — chunk_rows 26 · total_rows 7978
-- │ 다음: 02_staging_verify  (전량 게이트)
-- └──────────────────────────────────────────────────────────┘
