-- pilot12_danielle_cover_load.sql — 시범 12권 표지 제목 낭독 book_audio 적재 초안
-- 생성: 2026-07-22 (워커) / 근거: ADR-0034 Amendment #1(kind='cover') + Amendment #2(성우 층위)
--                              ADR-0052 Amendment #2(Danielle long-form + atempo)
--
-- ★ 실행은 팀장 영역(Supabase SQL Editor). 워커는 초안만 산출한다(ADR-0052 D8).
-- ★ 실행 전제: 표지 오디오 24개(cover.mp3/cover.marks.json × 12권) Storage 업로드 완료.
-- ★ 본문 138행 적재(pilot12_danielle_load.sql)와 **독립**이다. 순서 무관, 서로 충돌 없음.
--
-- page_index = 0 고정 placeholder (ADR-0034 Amd#1 명시):
--   · 스키마 CHECK (page_index >= 0)를 그대로 충족한다. 완화·변경 없음.
--   · 표지 경로는 audio_path에 '.../cover.mp3'로 명시 저장되므로 page_index가 경로를 만들지 않는다.
--   · UNIQUE (book_id, kind, page_index, voice)에 kind가 포함되어
--     표지('cover',0,'danielle')와 본문 첫 면('page',0,'danielle')이 충돌하지 않는다.
--
-- 컬럼 값: voice='danielle' / engine='long-form' / rate=85(atempo 0.85 실효속도)
--          duration_ms = 감속 후 mp3 실측 길이(ffmpeg)
--          marks_path  = 동 폴더 cover.marks.json (스키마상 NULL 허용이나 전 행 존재)
--
-- 낭독 문장 = books.title 원문 그대로(느낌표·커브따옴표 포함). 각 행 주석에 병기.
--   marks의 start/end가 이 문자열 기준 바이트 오프셋이므로, 뷰어가 표시하는 제목 문자열이
--   books.title과 1바이트라도 다르면 하이라이트가 어긋난다.
--
-- ON CONFLICT (book_id, kind, page_index, voice) DO UPDATE — 재실행 안전(경로 정정 반영).
--   덮어쓰기를 원치 않으면 DO UPDATE SET 블록을 DO NOTHING 으로 바꿔 실행할 것.

BEGIN;

-- ============================================================
-- [0] 실행 전 검증 — 대상 12권 존재 + 기존 cover 행 유무
-- ============================================================
-- 기대: 12행, cover_rows 전부 0 (최초 적재), page_rows 는 본문 적재분
SELECT b.source_id AS slug,
       count(*) FILTER (WHERE a.kind = 'cover' AND a.voice = 'danielle') AS cover_rows,
       count(*) FILTER (WHERE a.kind = 'page'  AND a.voice = 'danielle') AS page_rows
  FROM public.books b
  LEFT JOIN public.book_audio a ON a.book_id = b.id
 WHERE b.id IN (
   'cf26dae0-eba7-40bb-a4d4-6242b379c1ba',  -- a-day-out
   '0134f341-7b58-4c7c-b17a-8d4e036dcd72',  -- a-trip-to-the-tap
   '3e219305-97f9-49a7-8a80-0c6767145af7',  -- a-very-busy-day
   '87069ecb-b546-4cbe-b8b4-bca723b43f12',  -- aaaaahhh-mmawe
   '2866e4c4-22f2-4acc-a12c-b88552820fe6',  -- alexs-super-medicine
   'f3e5da2f-a04d-4b08-ac81-4dee971c15e8',  -- amahle-wants-to-help
   'c5bbb00e-1d95-405a-bb4f-6b35a27c582e',  -- ann-nem-oh-nee-finds-adventure
   '6e802972-1993-4171-82e0-4c989d19f97a',  -- auntie-bois-gift
   '22a4f65f-df39-44c3-863f-81d7855e35c0',  -- baby-babble
   'ecd263ae-03ed-4be9-bc7b-29392fc9bbc1',  -- baby-talk
   'b799bdd3-5278-4e81-afca-71e1c04dc32d',  -- babys-first-family-photo
   'aaf10a7e-6b50-4840-8999-3f2c76a2c731'  -- banzis-busy-bees
 )
 GROUP BY b.source_id ORDER BY b.source_id;

-- ============================================================
-- [1] book_audio INSERT — 표지 12행 (kind='cover', page_index=0)
-- ============================================================
INSERT INTO public.book_audio
  (book_id, kind, page_index, audio_path, marks_path, voice, engine, rate, duration_ms)
VALUES
  -- a-day-out — 낭독: A Day Out
  ('cf26dae0-eba7-40bb-a4d4-6242b379c1ba', 'cover', 0, 'book_dash-a-day-out/danielle/cover.mp3', 'book_dash-a-day-out/danielle/cover.marks.json', 'danielle', 'long-form', 85, 1560),
  -- a-trip-to-the-tap — 낭독: A trip to the tap
  ('0134f341-7b58-4c7c-b17a-8d4e036dcd72', 'cover', 0, 'book_dash-a-trip-to-the-tap/danielle/cover.mp3', 'book_dash-a-trip-to-the-tap/danielle/cover.marks.json', 'danielle', 'long-form', 85, 2500),
  -- a-very-busy-day — 낭독: A very busy day!
  ('3e219305-97f9-49a7-8a80-0c6767145af7', 'cover', 0, 'book_dash-a-very-busy-day/danielle/cover.mp3', 'book_dash-a-very-busy-day/danielle/cover.marks.json', 'danielle', 'long-form', 85, 2210),
  -- aaaaahhh-mmawe — 낭독: AAAAAHHH!!!! Mmawe!
  ('87069ecb-b546-4cbe-b8b4-bca723b43f12', 'cover', 0, 'book_dash-aaaaahhh-mmawe/danielle/cover.mp3', 'book_dash-aaaaahhh-mmawe/danielle/cover.marks.json', 'danielle', 'long-form', 85, 1460),
  -- alexs-super-medicine — 낭독: Alex’s Super Medicine
  ('2866e4c4-22f2-4acc-a12c-b88552820fe6', 'cover', 0, 'book_dash-alexs-super-medicine/danielle/cover.mp3', 'book_dash-alexs-super-medicine/danielle/cover.marks.json', 'danielle', 'long-form', 85, 3050),
  -- amahle-wants-to-help — 낭독: Amahle wants to help!
  ('f3e5da2f-a04d-4b08-ac81-4dee971c15e8', 'cover', 0, 'book_dash-amahle-wants-to-help/danielle/cover.mp3', 'book_dash-amahle-wants-to-help/danielle/cover.marks.json', 'danielle', 'long-form', 85, 2540),
  -- ann-nem-oh-nee-finds-adventure — 낭독: Ann-Nem-Oh-Nee finds Adventure
  ('c5bbb00e-1d95-405a-bb4f-6b35a27c582e', 'cover', 0, 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/cover.mp3', 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/cover.marks.json', 'danielle', 'long-form', 85, 4460),
  -- auntie-bois-gift — 낭독: Auntie Boi’s Gift
  ('6e802972-1993-4171-82e0-4c989d19f97a', 'cover', 0, 'book_dash-auntie-bois-gift/danielle/cover.mp3', 'book_dash-auntie-bois-gift/danielle/cover.marks.json', 'danielle', 'long-form', 85, 2160),
  -- baby-babble — 낭독: Baby Babble
  ('22a4f65f-df39-44c3-863f-81d7855e35c0', 'cover', 0, 'book_dash-baby-babble/danielle/cover.mp3', 'book_dash-baby-babble/danielle/cover.marks.json', 'danielle', 'long-form', 85, 1660),
  -- baby-talk — 낭독: Baby Talk
  ('ecd263ae-03ed-4be9-bc7b-29392fc9bbc1', 'cover', 0, 'book_dash-baby-talk/danielle/cover.mp3', 'book_dash-baby-talk/danielle/cover.marks.json', 'danielle', 'long-form', 85, 1800),
  -- babys-first-family-photo — 낭독: Baby’s First Family Photo
  ('b799bdd3-5278-4e81-afca-71e1c04dc32d', 'cover', 0, 'book_dash-babys-first-family-photo/danielle/cover.mp3', 'book_dash-babys-first-family-photo/danielle/cover.marks.json', 'danielle', 'long-form', 85, 3260),
  -- banzis-busy-bees — 낭독: Banzi’s Busy Bees
  ('aaf10a7e-6b50-4840-8999-3f2c76a2c731', 'cover', 0, 'book_dash-banzis-busy-bees/danielle/cover.mp3', 'book_dash-banzis-busy-bees/danielle/cover.marks.json', 'danielle', 'long-form', 85, 3050)
ON CONFLICT (book_id, kind, page_index, voice) DO UPDATE SET
  audio_path  = EXCLUDED.audio_path,
  marks_path  = EXCLUDED.marks_path,
  engine      = EXCLUDED.engine,
  rate        = EXCLUDED.rate,
  duration_ms = EXCLUDED.duration_ms;

-- 검증: 기대 12행
SELECT count(*) AS cover_rows
  FROM public.book_audio
 WHERE kind = 'cover' AND voice = 'danielle';

-- 검증: 권별 1행씩(기대 12행, 전부 pages=1)
SELECT b.source_id AS slug, count(*) AS covers
  FROM public.book_audio a JOIN public.books b ON b.id = a.book_id
 WHERE a.kind = 'cover' AND a.voice = 'danielle'
 GROUP BY b.source_id ORDER BY b.source_id;

-- 참고: books.has_audio·book_review.status 는 본문 적재에서 이미 처리됨 → 본 SQL에서 변경 없음.

-- 전부 기대값과 일치하면 COMMIT, 아니면 ROLLBACK.
-- COMMIT;
ROLLBACK;  -- ← 기본은 ROLLBACK. 검증 통과 확인 후 이 줄을 COMMIT; 으로 바꿔 재실행할 것.
