-- =============================================================================
-- 20260814-101906.sql — TTS 요청분 book_audio 적재 + book_review 전이 (ADR-0058 D6)
--
-- 생성: scripts/tts_pilot/process_tts_requests.py --sql  (DB 접속 0건 · 쓰기 0건)
-- 실행: 팀장 (Supabase SQL Editor). 워커 DB 직접 쓰기 금지(ADR-0053 D6-①).
--
-- 적재 대상: 1권 / 13행 (page 12 + cover 1)
-- 값       : voice='danielle' · engine='long-form' · rate=85 (atempo 0.85의 실효 속도, SSML prosody 아님 — ADR-0052 Amd#2)
--            duration_ms = 감속 후 mp3 실측(ffmpeg). audio_path = 버킷명 미포함 오브젝트 키.
--            좌표계 = 원문(개행 보존, ADR-0058 D6 — 리더 오프셋 정합).
--
-- ★ 본 파일은 BEGIN … ROLLBACK 리허설이다. 기대값이 맞으면 맨 끝 ROLLBACK 을
--   COMMIT 으로 직접 고쳐 타이핑한 뒤 재실행할 것 (ADR-0053 E9 규약).
-- ★ 선행 조건: Storage 업로드(--upload) 완료. 업로드 없이 적재하면 재생이 404가 된다.
-- =============================================================================

BEGIN;

-- [1] book_audio 적재 — ON CONFLICT 절 없음(덮어쓰기 구조적 불가, load708 선례)
INSERT INTO public.book_audio
  (book_id, kind, page_index, audio_path, marks_path, voice, engine, rate, duration_ms)
VALUES
  ('56027756-fc5d-45f9-8b8c-fe33727e6089', 'page', 0, 'book_dash-catch-that-cat/danielle/p01.mp3', 'book_dash-catch-that-cat/danielle/p01.marks.json', 'danielle', 'long-form', 85, 3940),
  ('56027756-fc5d-45f9-8b8c-fe33727e6089', 'page', 1, 'book_dash-catch-that-cat/danielle/p02.mp3', 'book_dash-catch-that-cat/danielle/p02.marks.json', 'danielle', 'long-form', 85, 7440),
  ('56027756-fc5d-45f9-8b8c-fe33727e6089', 'page', 2, 'book_dash-catch-that-cat/danielle/p03.mp3', 'book_dash-catch-that-cat/danielle/p03.marks.json', 'danielle', 'long-form', 85, 8570),
  ('56027756-fc5d-45f9-8b8c-fe33727e6089', 'page', 3, 'book_dash-catch-that-cat/danielle/p04.mp3', 'book_dash-catch-that-cat/danielle/p04.marks.json', 'danielle', 'long-form', 85, 7490),
  ('56027756-fc5d-45f9-8b8c-fe33727e6089', 'page', 4, 'book_dash-catch-that-cat/danielle/p05.mp3', 'book_dash-catch-that-cat/danielle/p05.marks.json', 'danielle', 'long-form', 85, 8140),
  ('56027756-fc5d-45f9-8b8c-fe33727e6089', 'page', 5, 'book_dash-catch-that-cat/danielle/p06.mp3', 'book_dash-catch-that-cat/danielle/p06.marks.json', 'danielle', 'long-form', 85, 7870),
  ('56027756-fc5d-45f9-8b8c-fe33727e6089', 'page', 6, 'book_dash-catch-that-cat/danielle/p07.mp3', 'book_dash-catch-that-cat/danielle/p07.marks.json', 'danielle', 'long-form', 85, 7560),
  ('56027756-fc5d-45f9-8b8c-fe33727e6089', 'page', 7, 'book_dash-catch-that-cat/danielle/p08.mp3', 'book_dash-catch-that-cat/danielle/p08.marks.json', 'danielle', 'long-form', 85, 6170),
  ('56027756-fc5d-45f9-8b8c-fe33727e6089', 'page', 8, 'book_dash-catch-that-cat/danielle/p09.mp3', 'book_dash-catch-that-cat/danielle/p09.marks.json', 'danielle', 'long-form', 85, 5760),
  ('56027756-fc5d-45f9-8b8c-fe33727e6089', 'page', 9, 'book_dash-catch-that-cat/danielle/p10.mp3', 'book_dash-catch-that-cat/danielle/p10.marks.json', 'danielle', 'long-form', 85, 1030),
  ('56027756-fc5d-45f9-8b8c-fe33727e6089', 'page', 10, 'book_dash-catch-that-cat/danielle/p11.mp3', 'book_dash-catch-that-cat/danielle/p11.marks.json', 'danielle', 'long-form', 85, 6720),
  ('56027756-fc5d-45f9-8b8c-fe33727e6089', 'page', 11, 'book_dash-catch-that-cat/danielle/p12.mp3', 'book_dash-catch-that-cat/danielle/p12.marks.json', 'danielle', 'long-form', 85, 7150),
  ('56027756-fc5d-45f9-8b8c-fe33727e6089', 'cover', 0, 'book_dash-catch-that-cat/danielle/cover.mp3', 'book_dash-catch-that-cat/danielle/cover.marks.json', 'danielle', 'long-form', 85, 2280);

-- [2] 검수 상태 전이 tts_requested → tts_done (ADR-0058 D2·D6)
--     조건부 UPDATE — 배치 도중 화면에서 철회된 권은 덮어쓰지 않는다(ADR-0058 O2).
UPDATE public.book_review SET status = 'tts_done'
 WHERE status = 'tts_requested'
   AND book_id IN (
     '56027756-fc5d-45f9-8b8c-fe33727e6089'
   );

-- [3] 후검증 — 마지막 SELECT만 SQL Editor에 표시된다
-- 기대: inserted_rows 13 / null_duration 0 / dup_unique 0 / tts_done 1
SELECT
  (SELECT count(*) FROM public.book_audio a WHERE a.book_id IN (
     '56027756-fc5d-45f9-8b8c-fe33727e6089'
   )) AS inserted_rows,
  (SELECT count(*) FROM public.book_audio WHERE duration_ms IS NULL) AS null_duration,
  (SELECT count(*) FROM (SELECT 1 FROM public.book_audio
     GROUP BY book_id, kind, page_index, voice HAVING count(*) > 1) t) AS dup_unique,
  (SELECT count(*) FROM public.book_review r WHERE r.status = 'tts_done'
     AND r.book_id IN (
       '56027756-fc5d-45f9-8b8c-fe33727e6089'
     )) AS tts_done_books,
  CASE WHEN (SELECT count(*) FROM public.book_audio WHERE duration_ms IS NULL) = 0
        AND (SELECT count(*) FROM (SELECT 1 FROM public.book_audio
              GROUP BY book_id, kind, page_index, voice HAVING count(*) > 1) t) = 0
       THEN 'PASS — ROLLBACK을 COMMIT으로 고쳐 재실행할 것'
       ELSE 'FAIL — 수치를 워커에게 전달할 것'
  END AS verdict;

ROLLBACK;   -- ← 기대값 일치 시 COMMIT 으로 고쳐 재실행
