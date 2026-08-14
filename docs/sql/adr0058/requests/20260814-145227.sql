-- =============================================================================
-- 20260814-145227.sql — TTS 요청분 book_audio 적재 + book_review 전이 (ADR-0058 D6)
--
-- 생성: scripts/tts_pilot/process_tts_requests.py --sql  (DB 접속 0건 · 쓰기 0건)
-- 실행: 팀장 (Supabase SQL Editor). 워커 DB 직접 쓰기 금지(ADR-0053 D6-①).
--
-- 적재 대상: 6권 / 76행 (page 70 + cover 6)
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
  ('c7a9c656-dc93-46a0-b16e-dfbef88e62b7', 'page', 0, 'book_dash-and-also/danielle/p01.mp3', 'book_dash-and-also/danielle/p01.marks.json', 'danielle', 'long-form', 85, 4560),
  ('c7a9c656-dc93-46a0-b16e-dfbef88e62b7', 'page', 1, 'book_dash-and-also/danielle/p02.mp3', 'book_dash-and-also/danielle/p02.marks.json', 'danielle', 'long-form', 85, 9840),
  ('c7a9c656-dc93-46a0-b16e-dfbef88e62b7', 'page', 2, 'book_dash-and-also/danielle/p03.mp3', 'book_dash-and-also/danielle/p03.marks.json', 'danielle', 'long-form', 85, 3960),
  ('c7a9c656-dc93-46a0-b16e-dfbef88e62b7', 'page', 3, 'book_dash-and-also/danielle/p04.mp3', 'book_dash-and-also/danielle/p04.marks.json', 'danielle', 'long-form', 85, 10680),
  ('c7a9c656-dc93-46a0-b16e-dfbef88e62b7', 'page', 4, 'book_dash-and-also/danielle/p05.mp3', 'book_dash-and-also/danielle/p05.marks.json', 'danielle', 'long-form', 85, 3670),
  ('c7a9c656-dc93-46a0-b16e-dfbef88e62b7', 'page', 5, 'book_dash-and-also/danielle/p06.mp3', 'book_dash-and-also/danielle/p06.marks.json', 'danielle', 'long-form', 85, 9720),
  ('c7a9c656-dc93-46a0-b16e-dfbef88e62b7', 'page', 6, 'book_dash-and-also/danielle/p07.mp3', 'book_dash-and-also/danielle/p07.marks.json', 'danielle', 'long-form', 85, 9430),
  ('c7a9c656-dc93-46a0-b16e-dfbef88e62b7', 'page', 7, 'book_dash-and-also/danielle/p08.mp3', 'book_dash-and-also/danielle/p08.marks.json', 'danielle', 'long-form', 85, 6260),
  ('c7a9c656-dc93-46a0-b16e-dfbef88e62b7', 'page', 8, 'book_dash-and-also/danielle/p09.mp3', 'book_dash-and-also/danielle/p09.marks.json', 'danielle', 'long-form', 85, 12050),
  ('c7a9c656-dc93-46a0-b16e-dfbef88e62b7', 'page', 9, 'book_dash-and-also/danielle/p10.mp3', 'book_dash-and-also/danielle/p10.marks.json', 'danielle', 'long-form', 85, 13080),
  ('c7a9c656-dc93-46a0-b16e-dfbef88e62b7', 'page', 11, 'book_dash-and-also/danielle/p12.mp3', 'book_dash-and-also/danielle/p12.marks.json', 'danielle', 'long-form', 85, 11380),
  ('c7a9c656-dc93-46a0-b16e-dfbef88e62b7', 'cover', 0, 'book_dash-and-also/danielle/cover.mp3', 'book_dash-and-also/danielle/cover.marks.json', 'danielle', 'long-form', 85, 1730),
  ('1d128e9d-5313-4fc9-a555-3ad2d4743e0f', 'page', 0, 'book_dash-little-goat/danielle/p01.mp3', 'book_dash-little-goat/danielle/p01.marks.json', 'danielle', 'long-form', 85, 9120),
  ('1d128e9d-5313-4fc9-a555-3ad2d4743e0f', 'page', 1, 'book_dash-little-goat/danielle/p02.mp3', 'book_dash-little-goat/danielle/p02.marks.json', 'danielle', 'long-form', 85, 6240),
  ('1d128e9d-5313-4fc9-a555-3ad2d4743e0f', 'page', 2, 'book_dash-little-goat/danielle/p03.mp3', 'book_dash-little-goat/danielle/p03.marks.json', 'danielle', 'long-form', 85, 7560),
  ('1d128e9d-5313-4fc9-a555-3ad2d4743e0f', 'page', 3, 'book_dash-little-goat/danielle/p04.mp3', 'book_dash-little-goat/danielle/p04.marks.json', 'danielle', 'long-form', 85, 4370),
  ('1d128e9d-5313-4fc9-a555-3ad2d4743e0f', 'page', 4, 'book_dash-little-goat/danielle/p05.mp3', 'book_dash-little-goat/danielle/p05.marks.json', 'danielle', 'long-form', 85, 6720),
  ('1d128e9d-5313-4fc9-a555-3ad2d4743e0f', 'page', 5, 'book_dash-little-goat/danielle/p06.mp3', 'book_dash-little-goat/danielle/p06.marks.json', 'danielle', 'long-form', 85, 9340),
  ('1d128e9d-5313-4fc9-a555-3ad2d4743e0f', 'page', 6, 'book_dash-little-goat/danielle/p07.mp3', 'book_dash-little-goat/danielle/p07.marks.json', 'danielle', 'long-form', 85, 9170),
  ('1d128e9d-5313-4fc9-a555-3ad2d4743e0f', 'page', 7, 'book_dash-little-goat/danielle/p08.mp3', 'book_dash-little-goat/danielle/p08.marks.json', 'danielle', 'long-form', 85, 10850),
  ('1d128e9d-5313-4fc9-a555-3ad2d4743e0f', 'page', 8, 'book_dash-little-goat/danielle/p09.mp3', 'book_dash-little-goat/danielle/p09.marks.json', 'danielle', 'long-form', 85, 8140),
  ('1d128e9d-5313-4fc9-a555-3ad2d4743e0f', 'page', 9, 'book_dash-little-goat/danielle/p10.mp3', 'book_dash-little-goat/danielle/p10.marks.json', 'danielle', 'long-form', 85, 4540),
  ('1d128e9d-5313-4fc9-a555-3ad2d4743e0f', 'page', 10, 'book_dash-little-goat/danielle/p11.mp3', 'book_dash-little-goat/danielle/p11.marks.json', 'danielle', 'long-form', 85, 3960),
  ('1d128e9d-5313-4fc9-a555-3ad2d4743e0f', 'page', 11, 'book_dash-little-goat/danielle/p12.mp3', 'book_dash-little-goat/danielle/p12.marks.json', 'danielle', 'long-form', 85, 12670),
  ('1d128e9d-5313-4fc9-a555-3ad2d4743e0f', 'cover', 0, 'book_dash-little-goat/danielle/cover.mp3', 'book_dash-little-goat/danielle/cover.marks.json', 'danielle', 'long-form', 85, 1900),
  ('0cb08289-1f83-4070-bd84-ab447c1ae6cd', 'page', 0, 'book_dash-look-up/danielle/p01.mp3', 'book_dash-look-up/danielle/p01.marks.json', 'danielle', 'long-form', 85, 4059),
  ('0cb08289-1f83-4070-bd84-ab447c1ae6cd', 'page', 1, 'book_dash-look-up/danielle/p02.mp3', 'book_dash-look-up/danielle/p02.marks.json', 'danielle', 'long-form', 85, 4900),
  ('0cb08289-1f83-4070-bd84-ab447c1ae6cd', 'page', 2, 'book_dash-look-up/danielle/p03.mp3', 'book_dash-look-up/danielle/p03.marks.json', 'danielle', 'long-form', 85, 5330),
  ('0cb08289-1f83-4070-bd84-ab447c1ae6cd', 'page', 3, 'book_dash-look-up/danielle/p04.mp3', 'book_dash-look-up/danielle/p04.marks.json', 'danielle', 'long-form', 85, 6380),
  ('0cb08289-1f83-4070-bd84-ab447c1ae6cd', 'page', 4, 'book_dash-look-up/danielle/p05.mp3', 'book_dash-look-up/danielle/p05.marks.json', 'danielle', 'long-form', 85, 4250),
  ('0cb08289-1f83-4070-bd84-ab447c1ae6cd', 'page', 5, 'book_dash-look-up/danielle/p06.mp3', 'book_dash-look-up/danielle/p06.marks.json', 'danielle', 'long-form', 85, 4820),
  ('0cb08289-1f83-4070-bd84-ab447c1ae6cd', 'page', 6, 'book_dash-look-up/danielle/p07.mp3', 'book_dash-look-up/danielle/p07.marks.json', 'danielle', 'long-form', 85, 4440),
  ('0cb08289-1f83-4070-bd84-ab447c1ae6cd', 'page', 7, 'book_dash-look-up/danielle/p08.mp3', 'book_dash-look-up/danielle/p08.marks.json', 'danielle', 'long-form', 85, 4200),
  ('0cb08289-1f83-4070-bd84-ab447c1ae6cd', 'page', 8, 'book_dash-look-up/danielle/p09.mp3', 'book_dash-look-up/danielle/p09.marks.json', 'danielle', 'long-form', 85, 3460),
  ('0cb08289-1f83-4070-bd84-ab447c1ae6cd', 'page', 9, 'book_dash-look-up/danielle/p10.mp3', 'book_dash-look-up/danielle/p10.marks.json', 'danielle', 'long-form', 85, 5660),
  ('0cb08289-1f83-4070-bd84-ab447c1ae6cd', 'page', 10, 'book_dash-look-up/danielle/p11.mp3', 'book_dash-look-up/danielle/p11.marks.json', 'danielle', 'long-form', 85, 2400),
  ('0cb08289-1f83-4070-bd84-ab447c1ae6cd', 'page', 11, 'book_dash-look-up/danielle/p12.mp3', 'book_dash-look-up/danielle/p12.marks.json', 'danielle', 'long-form', 85, 4300),
  ('0cb08289-1f83-4070-bd84-ab447c1ae6cd', 'cover', 0, 'book_dash-look-up/danielle/cover.mp3', 'book_dash-look-up/danielle/cover.marks.json', 'danielle', 'long-form', 85, 1220),
  ('57eadf0f-e621-498d-8ae7-d01f78f49071', 'page', 0, 'book_dash-the-rainbow-cloud/danielle/p01.mp3', 'book_dash-the-rainbow-cloud/danielle/p01.marks.json', 'danielle', 'long-form', 85, 11500),
  ('57eadf0f-e621-498d-8ae7-d01f78f49071', 'page', 1, 'book_dash-the-rainbow-cloud/danielle/p02.mp3', 'book_dash-the-rainbow-cloud/danielle/p02.marks.json', 'danielle', 'long-form', 85, 10630),
  ('57eadf0f-e621-498d-8ae7-d01f78f49071', 'page', 2, 'book_dash-the-rainbow-cloud/danielle/p03.mp3', 'book_dash-the-rainbow-cloud/danielle/p03.marks.json', 'danielle', 'long-form', 85, 17880),
  ('57eadf0f-e621-498d-8ae7-d01f78f49071', 'page', 3, 'book_dash-the-rainbow-cloud/danielle/p04.mp3', 'book_dash-the-rainbow-cloud/danielle/p04.marks.json', 'danielle', 'long-form', 85, 27650),
  ('57eadf0f-e621-498d-8ae7-d01f78f49071', 'page', 4, 'book_dash-the-rainbow-cloud/danielle/p05.mp3', 'book_dash-the-rainbow-cloud/danielle/p05.marks.json', 'danielle', 'long-form', 85, 13870),
  ('57eadf0f-e621-498d-8ae7-d01f78f49071', 'page', 5, 'book_dash-the-rainbow-cloud/danielle/p06.mp3', 'book_dash-the-rainbow-cloud/danielle/p06.marks.json', 'danielle', 'long-form', 85, 10420),
  ('57eadf0f-e621-498d-8ae7-d01f78f49071', 'page', 6, 'book_dash-the-rainbow-cloud/danielle/p07.mp3', 'book_dash-the-rainbow-cloud/danielle/p07.marks.json', 'danielle', 'long-form', 85, 9120),
  ('57eadf0f-e621-498d-8ae7-d01f78f49071', 'page', 7, 'book_dash-the-rainbow-cloud/danielle/p08.mp3', 'book_dash-the-rainbow-cloud/danielle/p08.marks.json', 'danielle', 'long-form', 85, 9720),
  ('57eadf0f-e621-498d-8ae7-d01f78f49071', 'page', 8, 'book_dash-the-rainbow-cloud/danielle/p09.mp3', 'book_dash-the-rainbow-cloud/danielle/p09.marks.json', 'danielle', 'long-form', 85, 13130),
  ('57eadf0f-e621-498d-8ae7-d01f78f49071', 'page', 9, 'book_dash-the-rainbow-cloud/danielle/p10.mp3', 'book_dash-the-rainbow-cloud/danielle/p10.marks.json', 'danielle', 'long-form', 85, 11950),
  ('57eadf0f-e621-498d-8ae7-d01f78f49071', 'page', 10, 'book_dash-the-rainbow-cloud/danielle/p11.mp3', 'book_dash-the-rainbow-cloud/danielle/p11.marks.json', 'danielle', 'long-form', 85, 7730),
  ('57eadf0f-e621-498d-8ae7-d01f78f49071', 'page', 11, 'book_dash-the-rainbow-cloud/danielle/p12.mp3', 'book_dash-the-rainbow-cloud/danielle/p12.marks.json', 'danielle', 'long-form', 85, 6530),
  ('57eadf0f-e621-498d-8ae7-d01f78f49071', 'cover', 0, 'book_dash-the-rainbow-cloud/danielle/cover.mp3', 'book_dash-the-rainbow-cloud/danielle/cover.marks.json', 'danielle', 'long-form', 85, 2620),
  ('a4bb3b1a-1037-4568-877b-7174b8bbc018', 'page', 0, 'book_dash-where-is-lulu/danielle/p01.mp3', 'book_dash-where-is-lulu/danielle/p01.marks.json', 'danielle', 'long-form', 85, 1510),
  ('a4bb3b1a-1037-4568-877b-7174b8bbc018', 'page', 1, 'book_dash-where-is-lulu/danielle/p02.mp3', 'book_dash-where-is-lulu/danielle/p02.marks.json', 'danielle', 'long-form', 85, 4340),
  ('a4bb3b1a-1037-4568-877b-7174b8bbc018', 'page', 2, 'book_dash-where-is-lulu/danielle/p03.mp3', 'book_dash-where-is-lulu/danielle/p03.marks.json', 'danielle', 'long-form', 85, 6140),
  ('a4bb3b1a-1037-4568-877b-7174b8bbc018', 'page', 3, 'book_dash-where-is-lulu/danielle/p04.mp3', 'book_dash-where-is-lulu/danielle/p04.marks.json', 'danielle', 'long-form', 85, 5810),
  ('a4bb3b1a-1037-4568-877b-7174b8bbc018', 'page', 4, 'book_dash-where-is-lulu/danielle/p05.mp3', 'book_dash-where-is-lulu/danielle/p05.marks.json', 'danielle', 'long-form', 85, 5640),
  ('a4bb3b1a-1037-4568-877b-7174b8bbc018', 'page', 5, 'book_dash-where-is-lulu/danielle/p06.mp3', 'book_dash-where-is-lulu/danielle/p06.marks.json', 'danielle', 'long-form', 85, 4130),
  ('a4bb3b1a-1037-4568-877b-7174b8bbc018', 'page', 6, 'book_dash-where-is-lulu/danielle/p07.mp3', 'book_dash-where-is-lulu/danielle/p07.marks.json', 'danielle', 'long-form', 85, 5860),
  ('a4bb3b1a-1037-4568-877b-7174b8bbc018', 'page', 8, 'book_dash-where-is-lulu/danielle/p09.mp3', 'book_dash-where-is-lulu/danielle/p09.marks.json', 'danielle', 'long-form', 85, 2470),
  ('a4bb3b1a-1037-4568-877b-7174b8bbc018', 'page', 9, 'book_dash-where-is-lulu/danielle/p10.mp3', 'book_dash-where-is-lulu/danielle/p10.marks.json', 'danielle', 'long-form', 85, 4970),
  ('a4bb3b1a-1037-4568-877b-7174b8bbc018', 'page', 10, 'book_dash-where-is-lulu/danielle/p11.mp3', 'book_dash-where-is-lulu/danielle/p11.marks.json', 'danielle', 'long-form', 85, 5210),
  ('a4bb3b1a-1037-4568-877b-7174b8bbc018', 'page', 11, 'book_dash-where-is-lulu/danielle/p12.mp3', 'book_dash-where-is-lulu/danielle/p12.marks.json', 'danielle', 'long-form', 85, 2500),
  ('a4bb3b1a-1037-4568-877b-7174b8bbc018', 'cover', 0, 'book_dash-where-is-lulu/danielle/cover.mp3', 'book_dash-where-is-lulu/danielle/cover.marks.json', 'danielle', 'long-form', 85, 2020),
  ('b0242033-64bf-441c-9ffa-2846b2b4a9c7', 'page', 0, 'book_dash-yes-you-can/danielle/p01.mp3', 'book_dash-yes-you-can/danielle/p01.marks.json', 'danielle', 'long-form', 85, 5040),
  ('b0242033-64bf-441c-9ffa-2846b2b4a9c7', 'page', 1, 'book_dash-yes-you-can/danielle/p02.mp3', 'book_dash-yes-you-can/danielle/p02.marks.json', 'danielle', 'long-form', 85, 4150),
  ('b0242033-64bf-441c-9ffa-2846b2b4a9c7', 'page', 2, 'book_dash-yes-you-can/danielle/p03.mp3', 'book_dash-yes-you-can/danielle/p03.marks.json', 'danielle', 'long-form', 85, 21700),
  ('b0242033-64bf-441c-9ffa-2846b2b4a9c7', 'page', 3, 'book_dash-yes-you-can/danielle/p04.mp3', 'book_dash-yes-you-can/danielle/p04.marks.json', 'danielle', 'long-form', 85, 5400),
  ('b0242033-64bf-441c-9ffa-2846b2b4a9c7', 'page', 4, 'book_dash-yes-you-can/danielle/p05.mp3', 'book_dash-yes-you-can/danielle/p05.marks.json', 'danielle', 'long-form', 85, 15410),
  ('b0242033-64bf-441c-9ffa-2846b2b4a9c7', 'page', 5, 'book_dash-yes-you-can/danielle/p06.mp3', 'book_dash-yes-you-can/danielle/p06.marks.json', 'danielle', 'long-form', 85, 4200),
  ('b0242033-64bf-441c-9ffa-2846b2b4a9c7', 'page', 6, 'book_dash-yes-you-can/danielle/p07.mp3', 'book_dash-yes-you-can/danielle/p07.marks.json', 'danielle', 'long-form', 85, 22820),
  ('b0242033-64bf-441c-9ffa-2846b2b4a9c7', 'page', 7, 'book_dash-yes-you-can/danielle/p08.mp3', 'book_dash-yes-you-can/danielle/p08.marks.json', 'danielle', 'long-form', 85, 5330),
  ('b0242033-64bf-441c-9ffa-2846b2b4a9c7', 'page', 8, 'book_dash-yes-you-can/danielle/p09.mp3', 'book_dash-yes-you-can/danielle/p09.marks.json', 'danielle', 'long-form', 85, 16630),
  ('b0242033-64bf-441c-9ffa-2846b2b4a9c7', 'page', 9, 'book_dash-yes-you-can/danielle/p10.mp3', 'book_dash-yes-you-can/danielle/p10.marks.json', 'danielle', 'long-form', 85, 4750),
  ('b0242033-64bf-441c-9ffa-2846b2b4a9c7', 'page', 10, 'book_dash-yes-you-can/danielle/p11.mp3', 'book_dash-yes-you-can/danielle/p11.marks.json', 'danielle', 'long-form', 85, 10580),
  ('b0242033-64bf-441c-9ffa-2846b2b4a9c7', 'page', 11, 'book_dash-yes-you-can/danielle/p12.mp3', 'book_dash-yes-you-can/danielle/p12.marks.json', 'danielle', 'long-form', 85, 8760),
  ('b0242033-64bf-441c-9ffa-2846b2b4a9c7', 'cover', 0, 'book_dash-yes-you-can/danielle/cover.mp3', 'book_dash-yes-you-can/danielle/cover.marks.json', 'danielle', 'long-form', 85, 1940);

-- [2] 검수 상태 전이 tts_requested → tts_done (ADR-0058 D2·D6)
--     조건부 UPDATE — 배치 도중 화면에서 철회된 권은 덮어쓰지 않는다(ADR-0058 O2).
UPDATE public.book_review SET status = 'tts_done'
 WHERE status = 'tts_requested'
   AND book_id IN (
     '0cb08289-1f83-4070-bd84-ab447c1ae6cd',
     '1d128e9d-5313-4fc9-a555-3ad2d4743e0f',
     '57eadf0f-e621-498d-8ae7-d01f78f49071',
     'a4bb3b1a-1037-4568-877b-7174b8bbc018',
     'b0242033-64bf-441c-9ffa-2846b2b4a9c7',
     'c7a9c656-dc93-46a0-b16e-dfbef88e62b7'
   );

-- [3] 후검증 — 마지막 SELECT만 SQL Editor에 표시된다
-- 기대: inserted_rows 76 / null_duration 0 / dup_unique 0 / tts_done 6
SELECT
  (SELECT count(*) FROM public.book_audio a WHERE a.book_id IN (
     '0cb08289-1f83-4070-bd84-ab447c1ae6cd',
     '1d128e9d-5313-4fc9-a555-3ad2d4743e0f',
     '57eadf0f-e621-498d-8ae7-d01f78f49071',
     'a4bb3b1a-1037-4568-877b-7174b8bbc018',
     'b0242033-64bf-441c-9ffa-2846b2b4a9c7',
     'c7a9c656-dc93-46a0-b16e-dfbef88e62b7'
   )) AS inserted_rows,
  (SELECT count(*) FROM public.book_audio WHERE duration_ms IS NULL) AS null_duration,
  (SELECT count(*) FROM (SELECT 1 FROM public.book_audio
     GROUP BY book_id, kind, page_index, voice HAVING count(*) > 1) t) AS dup_unique,
  (SELECT count(*) FROM public.book_review r WHERE r.status = 'tts_done'
     AND r.book_id IN (
       '0cb08289-1f83-4070-bd84-ab447c1ae6cd',
       '1d128e9d-5313-4fc9-a555-3ad2d4743e0f',
       '57eadf0f-e621-498d-8ae7-d01f78f49071',
       'a4bb3b1a-1037-4568-877b-7174b8bbc018',
       'b0242033-64bf-441c-9ffa-2846b2b4a9c7',
       'c7a9c656-dc93-46a0-b16e-dfbef88e62b7'
     )) AS tts_done_books,
  CASE WHEN (SELECT count(*) FROM public.book_audio WHERE duration_ms IS NULL) = 0
        AND (SELECT count(*) FROM (SELECT 1 FROM public.book_audio
              GROUP BY book_id, kind, page_index, voice HAVING count(*) > 1) t) = 0
       THEN 'PASS — ROLLBACK을 COMMIT으로 고쳐 재실행할 것'
       ELSE 'FAIL — 수치를 워커에게 전달할 것'
  END AS verdict;

ROLLBACK;   -- ← 기대값 일치 시 COMMIT 으로 고쳐 재실행
