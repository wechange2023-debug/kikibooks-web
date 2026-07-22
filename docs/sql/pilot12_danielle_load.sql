-- pilot12_danielle_load.sql — 시범 12권 Danielle 오디오 book_audio 적재 + 상태 전이 초안
-- 생성: 2026-07-22 (워커) / 근거: ADR-0052 Amendment #2, ADR-0034(결정 ①②③ + Amd#1), ADR-0046
--
-- ★ 실행은 팀장 영역(Supabase SQL Editor). 워커는 초안만 산출한다(ADR-0052 D8).
-- ★ 실행 전제: Storage 업로드가 먼저 완료되어야 한다(audio_path가 가리키는 객체가 존재해야 함).
--
-- ┌─ 실행 전 반드시 확인할 미결 2건 (팀장 판단 필요) ────────────────────────────────┐
-- │ (1) 경로 축 충돌: ADR-0034 결정 ②는 pNN = page_index (0-based, p00부터).      │
-- │     ADR-0052 D5는 NN = page_index+1 (이미지 파일명 NN과 동일, p01부터).       │
-- │     실제 생성된 로컬 파일은 D5 축(p01..p12)이므로 본 SQL의 audio_path도 D5 축. │
-- │     → page_index 컬럼은 0-based 유지, 파일명은 1-based. 의도된 불일치이며      │
-- │       기존 44권(p00 축)과 규약이 갈린다. 확정 시 ADR-0034 개정 필요.           │
-- │ (2) voice 표기: 기존 행은 'Ruth'(대문자 시작), 본 배치는 키 구조를 따라        │
-- │     'danielle'(소문자). UNIQUE(book_id,kind,page_index,voice)에 voice가        │
-- │     포함되므로 표기 차이는 별도 트랙으로 공존한다(충돌 없음).                  │
-- └──────────────────────────────────────────────────────────────────────────────┘
--
-- 컬럼 매핑 근거 (ADR-0034 결정 ① 실행 SQL 기준):
--   page_index  0-based (= 로컬 page - 1). CHECK (page_index >= 0)
--   audio_path  버킷명 미포함 오브젝트 키만 (ADR-0034). 'book-audio/' 접두사 금지
--   marks_path  스키마에 존재하며 NULL 허용 — 본 배치는 전 행 marks 존재하므로 채운다
--   voice/engine/rate  'danielle' / 'long-form' / 85
--     ※ rate 85는 SSML prosody 값이 아니라 ffmpeg atempo=0.85로 얻은 '실효 속도'다.
--       SSML 감속은 울림 때문에 금지됨(Amendment #2). 스키마에 별도 컬럼이 없어
--       기존 rate 컬럼에 실효값을 기록한다. 컬럼 추가는 ADR 선행 원칙상 하지 않는다.
--   duration_ms 감속 후 mp3 실측 길이(ffmpeg). 마크 프록시 아님
--   kind        'page' 고정 (표지 오디오는 본 배치 범위 밖 — ADR-0034 Amd#1)
--
-- ON CONFLICT 방침: UNIQUE (book_id, kind, page_index, voice) 기준 DO UPDATE.
--   재실행 안전성을 위해 갱신형을 택한다. 기존 Ruth 행은 voice가 달라 영향받지 않는다.
--   '절대 덮어쓰지 않음'을 원하면 DO UPDATE 블록을 DO NOTHING 으로 바꿔 실행할 것.

BEGIN;

-- ============================================================
-- [0] 실행 전 검증 — 대상 12권이 존재하고 현재 상태가 confirmed인지
-- ============================================================
-- 기대: 12행, 전부 status='confirmed', has_audio=false
SELECT b.id, b.source_id AS slug, b.has_audio, r.status
  FROM public.books b
  LEFT JOIN public.book_review r ON r.book_id = b.id
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
 ORDER BY b.source_id;

-- ============================================================
-- [1] book_audio INSERT — 12권 × 텍스트 있는 면 (총 138행)
-- ============================================================
INSERT INTO public.book_audio
  (book_id, kind, page_index, audio_path, marks_path, voice, engine, rate, duration_ms)
VALUES
  -- a-day-out (8면)
  ('cf26dae0-eba7-40bb-a4d4-6242b379c1ba', 'page', 0, 'book_dash-a-day-out/danielle/p01.mp3', 'book_dash-a-day-out/danielle/p01.marks.json', 'danielle', 'long-form', 85, 2230),
  ('cf26dae0-eba7-40bb-a4d4-6242b379c1ba', 'page', 2, 'book_dash-a-day-out/danielle/p03.mp3', 'book_dash-a-day-out/danielle/p03.marks.json', 'danielle', 'long-form', 85, 1560),
  ('cf26dae0-eba7-40bb-a4d4-6242b379c1ba', 'page', 4, 'book_dash-a-day-out/danielle/p05.mp3', 'book_dash-a-day-out/danielle/p05.marks.json', 'danielle', 'long-form', 85, 1920),
  ('cf26dae0-eba7-40bb-a4d4-6242b379c1ba', 'page', 5, 'book_dash-a-day-out/danielle/p06.mp3', 'book_dash-a-day-out/danielle/p06.marks.json', 'danielle', 'long-form', 85, 2330),
  ('cf26dae0-eba7-40bb-a4d4-6242b379c1ba', 'page', 6, 'book_dash-a-day-out/danielle/p07.mp3', 'book_dash-a-day-out/danielle/p07.marks.json', 'danielle', 'long-form', 85, 1340),
  ('cf26dae0-eba7-40bb-a4d4-6242b379c1ba', 'page', 7, 'book_dash-a-day-out/danielle/p08.mp3', 'book_dash-a-day-out/danielle/p08.marks.json', 'danielle', 'long-form', 85, 1490),
  ('cf26dae0-eba7-40bb-a4d4-6242b379c1ba', 'page', 10, 'book_dash-a-day-out/danielle/p11.mp3', 'book_dash-a-day-out/danielle/p11.marks.json', 'danielle', 'long-form', 85, 1180),
  ('cf26dae0-eba7-40bb-a4d4-6242b379c1ba', 'page', 11, 'book_dash-a-day-out/danielle/p12.mp3', 'book_dash-a-day-out/danielle/p12.marks.json', 'danielle', 'long-form', 85, 2180),
  -- a-trip-to-the-tap (12면)
  ('0134f341-7b58-4c7c-b17a-8d4e036dcd72', 'page', 0, 'book_dash-a-trip-to-the-tap/danielle/p01.mp3', 'book_dash-a-trip-to-the-tap/danielle/p01.marks.json', 'danielle', 'long-form', 85, 10490),
  ('0134f341-7b58-4c7c-b17a-8d4e036dcd72', 'page', 1, 'book_dash-a-trip-to-the-tap/danielle/p02.mp3', 'book_dash-a-trip-to-the-tap/danielle/p02.marks.json', 'danielle', 'long-form', 85, 7150),
  ('0134f341-7b58-4c7c-b17a-8d4e036dcd72', 'page', 2, 'book_dash-a-trip-to-the-tap/danielle/p03.mp3', 'book_dash-a-trip-to-the-tap/danielle/p03.marks.json', 'danielle', 'long-form', 85, 9020),
  ('0134f341-7b58-4c7c-b17a-8d4e036dcd72', 'page', 3, 'book_dash-a-trip-to-the-tap/danielle/p04.mp3', 'book_dash-a-trip-to-the-tap/danielle/p04.marks.json', 'danielle', 'long-form', 85, 8520),
  ('0134f341-7b58-4c7c-b17a-8d4e036dcd72', 'page', 4, 'book_dash-a-trip-to-the-tap/danielle/p05.mp3', 'book_dash-a-trip-to-the-tap/danielle/p05.marks.json', 'danielle', 'long-form', 85, 9890),
  ('0134f341-7b58-4c7c-b17a-8d4e036dcd72', 'page', 5, 'book_dash-a-trip-to-the-tap/danielle/p06.mp3', 'book_dash-a-trip-to-the-tap/danielle/p06.marks.json', 'danielle', 'long-form', 85, 13220),
  ('0134f341-7b58-4c7c-b17a-8d4e036dcd72', 'page', 6, 'book_dash-a-trip-to-the-tap/danielle/p07.mp3', 'book_dash-a-trip-to-the-tap/danielle/p07.marks.json', 'danielle', 'long-form', 85, 9100),
  ('0134f341-7b58-4c7c-b17a-8d4e036dcd72', 'page', 7, 'book_dash-a-trip-to-the-tap/danielle/p08.mp3', 'book_dash-a-trip-to-the-tap/danielle/p08.marks.json', 'danielle', 'long-form', 85, 9260),
  ('0134f341-7b58-4c7c-b17a-8d4e036dcd72', 'page', 8, 'book_dash-a-trip-to-the-tap/danielle/p09.mp3', 'book_dash-a-trip-to-the-tap/danielle/p09.marks.json', 'danielle', 'long-form', 85, 8860),
  ('0134f341-7b58-4c7c-b17a-8d4e036dcd72', 'page', 9, 'book_dash-a-trip-to-the-tap/danielle/p10.mp3', 'book_dash-a-trip-to-the-tap/danielle/p10.marks.json', 'danielle', 'long-form', 85, 11110),
  ('0134f341-7b58-4c7c-b17a-8d4e036dcd72', 'page', 10, 'book_dash-a-trip-to-the-tap/danielle/p11.mp3', 'book_dash-a-trip-to-the-tap/danielle/p11.marks.json', 'danielle', 'long-form', 85, 10850),
  ('0134f341-7b58-4c7c-b17a-8d4e036dcd72', 'page', 11, 'book_dash-a-trip-to-the-tap/danielle/p12.mp3', 'book_dash-a-trip-to-the-tap/danielle/p12.marks.json', 'danielle', 'long-form', 85, 7920),
  -- a-very-busy-day (11면)
  ('3e219305-97f9-49a7-8a80-0c6767145af7', 'page', 0, 'book_dash-a-very-busy-day/danielle/p01.mp3', 'book_dash-a-very-busy-day/danielle/p01.marks.json', 'danielle', 'long-form', 85, 7150),
  ('3e219305-97f9-49a7-8a80-0c6767145af7', 'page', 1, 'book_dash-a-very-busy-day/danielle/p02.mp3', 'book_dash-a-very-busy-day/danielle/p02.marks.json', 'danielle', 'long-form', 85, 11380),
  ('3e219305-97f9-49a7-8a80-0c6767145af7', 'page', 2, 'book_dash-a-very-busy-day/danielle/p03.mp3', 'book_dash-a-very-busy-day/danielle/p03.marks.json', 'danielle', 'long-form', 85, 10580),
  ('3e219305-97f9-49a7-8a80-0c6767145af7', 'page', 3, 'book_dash-a-very-busy-day/danielle/p04.mp3', 'book_dash-a-very-busy-day/danielle/p04.marks.json', 'danielle', 'long-form', 85, 10340),
  ('3e219305-97f9-49a7-8a80-0c6767145af7', 'page', 4, 'book_dash-a-very-busy-day/danielle/p05.mp3', 'book_dash-a-very-busy-day/danielle/p05.marks.json', 'danielle', 'long-form', 85, 10920),
  ('3e219305-97f9-49a7-8a80-0c6767145af7', 'page', 5, 'book_dash-a-very-busy-day/danielle/p06.mp3', 'book_dash-a-very-busy-day/danielle/p06.marks.json', 'danielle', 'long-form', 85, 7320),
  ('3e219305-97f9-49a7-8a80-0c6767145af7', 'page', 6, 'book_dash-a-very-busy-day/danielle/p07.mp3', 'book_dash-a-very-busy-day/danielle/p07.marks.json', 'danielle', 'long-form', 85, 4250),
  ('3e219305-97f9-49a7-8a80-0c6767145af7', 'page', 8, 'book_dash-a-very-busy-day/danielle/p09.mp3', 'book_dash-a-very-busy-day/danielle/p09.marks.json', 'danielle', 'long-form', 85, 11740),
  ('3e219305-97f9-49a7-8a80-0c6767145af7', 'page', 9, 'book_dash-a-very-busy-day/danielle/p10.mp3', 'book_dash-a-very-busy-day/danielle/p10.marks.json', 'danielle', 'long-form', 85, 9790),
  ('3e219305-97f9-49a7-8a80-0c6767145af7', 'page', 10, 'book_dash-a-very-busy-day/danielle/p11.mp3', 'book_dash-a-very-busy-day/danielle/p11.marks.json', 'danielle', 'long-form', 85, 10580),
  ('3e219305-97f9-49a7-8a80-0c6767145af7', 'page', 11, 'book_dash-a-very-busy-day/danielle/p12.mp3', 'book_dash-a-very-busy-day/danielle/p12.marks.json', 'danielle', 'long-form', 85, 7630),
  -- aaaaahhh-mmawe (12면)
  ('87069ecb-b546-4cbe-b8b4-bca723b43f12', 'page', 0, 'book_dash-aaaaahhh-mmawe/danielle/p01.mp3', 'book_dash-aaaaahhh-mmawe/danielle/p01.marks.json', 'danielle', 'long-form', 85, 5980),
  ('87069ecb-b546-4cbe-b8b4-bca723b43f12', 'page', 1, 'book_dash-aaaaahhh-mmawe/danielle/p02.mp3', 'book_dash-aaaaahhh-mmawe/danielle/p02.marks.json', 'danielle', 'long-form', 85, 1460),
  ('87069ecb-b546-4cbe-b8b4-bca723b43f12', 'page', 2, 'book_dash-aaaaahhh-mmawe/danielle/p03.mp3', 'book_dash-aaaaahhh-mmawe/danielle/p03.marks.json', 'danielle', 'long-form', 85, 12720),
  ('87069ecb-b546-4cbe-b8b4-bca723b43f12', 'page', 3, 'book_dash-aaaaahhh-mmawe/danielle/p04.mp3', 'book_dash-aaaaahhh-mmawe/danielle/p04.marks.json', 'danielle', 'long-form', 85, 9430),
  ('87069ecb-b546-4cbe-b8b4-bca723b43f12', 'page', 4, 'book_dash-aaaaahhh-mmawe/danielle/p05.mp3', 'book_dash-aaaaahhh-mmawe/danielle/p05.marks.json', 'danielle', 'long-form', 85, 1460),
  ('87069ecb-b546-4cbe-b8b4-bca723b43f12', 'page', 5, 'book_dash-aaaaahhh-mmawe/danielle/p06.mp3', 'book_dash-aaaaahhh-mmawe/danielle/p06.marks.json', 'danielle', 'long-form', 85, 12530),
  ('87069ecb-b546-4cbe-b8b4-bca723b43f12', 'page', 6, 'book_dash-aaaaahhh-mmawe/danielle/p07.mp3', 'book_dash-aaaaahhh-mmawe/danielle/p07.marks.json', 'danielle', 'long-form', 85, 3000),
  ('87069ecb-b546-4cbe-b8b4-bca723b43f12', 'page', 7, 'book_dash-aaaaahhh-mmawe/danielle/p08.mp3', 'book_dash-aaaaahhh-mmawe/danielle/p08.marks.json', 'danielle', 'long-form', 85, 1460),
  ('87069ecb-b546-4cbe-b8b4-bca723b43f12', 'page', 8, 'book_dash-aaaaahhh-mmawe/danielle/p09.mp3', 'book_dash-aaaaahhh-mmawe/danielle/p09.marks.json', 'danielle', 'long-form', 85, 9140),
  ('87069ecb-b546-4cbe-b8b4-bca723b43f12', 'page', 9, 'book_dash-aaaaahhh-mmawe/danielle/p10.mp3', 'book_dash-aaaaahhh-mmawe/danielle/p10.marks.json', 'danielle', 'long-form', 85, 7900),
  ('87069ecb-b546-4cbe-b8b4-bca723b43f12', 'page', 10, 'book_dash-aaaaahhh-mmawe/danielle/p11.mp3', 'book_dash-aaaaahhh-mmawe/danielle/p11.marks.json', 'danielle', 'long-form', 85, 1460),
  ('87069ecb-b546-4cbe-b8b4-bca723b43f12', 'page', 11, 'book_dash-aaaaahhh-mmawe/danielle/p12.mp3', 'book_dash-aaaaahhh-mmawe/danielle/p12.marks.json', 'danielle', 'long-form', 85, 6890),
  -- alexs-super-medicine (12면)
  ('2866e4c4-22f2-4acc-a12c-b88552820fe6', 'page', 0, 'book_dash-alexs-super-medicine/danielle/p01.mp3', 'book_dash-alexs-super-medicine/danielle/p01.marks.json', 'danielle', 'long-form', 85, 7150),
  ('2866e4c4-22f2-4acc-a12c-b88552820fe6', 'page', 1, 'book_dash-alexs-super-medicine/danielle/p02.mp3', 'book_dash-alexs-super-medicine/danielle/p02.marks.json', 'danielle', 'long-form', 85, 8350),
  ('2866e4c4-22f2-4acc-a12c-b88552820fe6', 'page', 2, 'book_dash-alexs-super-medicine/danielle/p03.mp3', 'book_dash-alexs-super-medicine/danielle/p03.marks.json', 'danielle', 'long-form', 85, 8260),
  ('2866e4c4-22f2-4acc-a12c-b88552820fe6', 'page', 3, 'book_dash-alexs-super-medicine/danielle/p04.mp3', 'book_dash-alexs-super-medicine/danielle/p04.marks.json', 'danielle', 'long-form', 85, 6770),
  ('2866e4c4-22f2-4acc-a12c-b88552820fe6', 'page', 4, 'book_dash-alexs-super-medicine/danielle/p05.mp3', 'book_dash-alexs-super-medicine/danielle/p05.marks.json', 'danielle', 'long-form', 85, 740),
  ('2866e4c4-22f2-4acc-a12c-b88552820fe6', 'page', 5, 'book_dash-alexs-super-medicine/danielle/p06.mp3', 'book_dash-alexs-super-medicine/danielle/p06.marks.json', 'danielle', 'long-form', 85, 6220),
  ('2866e4c4-22f2-4acc-a12c-b88552820fe6', 'page', 6, 'book_dash-alexs-super-medicine/danielle/p07.mp3', 'book_dash-alexs-super-medicine/danielle/p07.marks.json', 'danielle', 'long-form', 85, 840),
  ('2866e4c4-22f2-4acc-a12c-b88552820fe6', 'page', 7, 'book_dash-alexs-super-medicine/danielle/p08.mp3', 'book_dash-alexs-super-medicine/danielle/p08.marks.json', 'danielle', 'long-form', 85, 5710),
  ('2866e4c4-22f2-4acc-a12c-b88552820fe6', 'page', 8, 'book_dash-alexs-super-medicine/danielle/p09.mp3', 'book_dash-alexs-super-medicine/danielle/p09.marks.json', 'danielle', 'long-form', 85, 550),
  ('2866e4c4-22f2-4acc-a12c-b88552820fe6', 'page', 9, 'book_dash-alexs-super-medicine/danielle/p10.mp3', 'book_dash-alexs-super-medicine/danielle/p10.marks.json', 'danielle', 'long-form', 85, 3720),
  ('2866e4c4-22f2-4acc-a12c-b88552820fe6', 'page', 10, 'book_dash-alexs-super-medicine/danielle/p11.mp3', 'book_dash-alexs-super-medicine/danielle/p11.marks.json', 'danielle', 'long-form', 85, 8180),
  ('2866e4c4-22f2-4acc-a12c-b88552820fe6', 'page', 11, 'book_dash-alexs-super-medicine/danielle/p12.mp3', 'book_dash-alexs-super-medicine/danielle/p12.marks.json', 'danielle', 'long-form', 85, 9770),
  -- amahle-wants-to-help (12면)
  ('f3e5da2f-a04d-4b08-ac81-4dee971c15e8', 'page', 0, 'book_dash-amahle-wants-to-help/danielle/p01.mp3', 'book_dash-amahle-wants-to-help/danielle/p01.marks.json', 'danielle', 'long-form', 85, 13800),
  ('f3e5da2f-a04d-4b08-ac81-4dee971c15e8', 'page', 1, 'book_dash-amahle-wants-to-help/danielle/p02.mp3', 'book_dash-amahle-wants-to-help/danielle/p02.marks.json', 'danielle', 'long-form', 85, 3820),
  ('f3e5da2f-a04d-4b08-ac81-4dee971c15e8', 'page', 2, 'book_dash-amahle-wants-to-help/danielle/p03.mp3', 'book_dash-amahle-wants-to-help/danielle/p03.marks.json', 'danielle', 'long-form', 85, 8930),
  ('f3e5da2f-a04d-4b08-ac81-4dee971c15e8', 'page', 3, 'book_dash-amahle-wants-to-help/danielle/p04.mp3', 'book_dash-amahle-wants-to-help/danielle/p04.marks.json', 'danielle', 'long-form', 85, 3820),
  ('f3e5da2f-a04d-4b08-ac81-4dee971c15e8', 'page', 4, 'book_dash-amahle-wants-to-help/danielle/p05.mp3', 'book_dash-amahle-wants-to-help/danielle/p05.marks.json', 'danielle', 'long-form', 85, 9290),
  ('f3e5da2f-a04d-4b08-ac81-4dee971c15e8', 'page', 5, 'book_dash-amahle-wants-to-help/danielle/p06.mp3', 'book_dash-amahle-wants-to-help/danielle/p06.marks.json', 'danielle', 'long-form', 85, 3820),
  ('f3e5da2f-a04d-4b08-ac81-4dee971c15e8', 'page', 6, 'book_dash-amahle-wants-to-help/danielle/p07.mp3', 'book_dash-amahle-wants-to-help/danielle/p07.marks.json', 'danielle', 'long-form', 85, 8420),
  ('f3e5da2f-a04d-4b08-ac81-4dee971c15e8', 'page', 7, 'book_dash-amahle-wants-to-help/danielle/p08.mp3', 'book_dash-amahle-wants-to-help/danielle/p08.marks.json', 'danielle', 'long-form', 85, 3820),
  ('f3e5da2f-a04d-4b08-ac81-4dee971c15e8', 'page', 8, 'book_dash-amahle-wants-to-help/danielle/p09.mp3', 'book_dash-amahle-wants-to-help/danielle/p09.marks.json', 'danielle', 'long-form', 85, 9670),
  ('f3e5da2f-a04d-4b08-ac81-4dee971c15e8', 'page', 9, 'book_dash-amahle-wants-to-help/danielle/p10.mp3', 'book_dash-amahle-wants-to-help/danielle/p10.marks.json', 'danielle', 'long-form', 85, 3820),
  ('f3e5da2f-a04d-4b08-ac81-4dee971c15e8', 'page', 10, 'book_dash-amahle-wants-to-help/danielle/p11.mp3', 'book_dash-amahle-wants-to-help/danielle/p11.marks.json', 'danielle', 'long-form', 85, 8060),
  ('f3e5da2f-a04d-4b08-ac81-4dee971c15e8', 'page', 11, 'book_dash-amahle-wants-to-help/danielle/p12.mp3', 'book_dash-amahle-wants-to-help/danielle/p12.marks.json', 'danielle', 'long-form', 85, 2930),
  -- ann-nem-oh-nee-finds-adventure (12면)
  ('c5bbb00e-1d95-405a-bb4f-6b35a27c582e', 'page', 0, 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p01.mp3', 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p01.marks.json', 'danielle', 'long-form', 85, 14760),
  ('c5bbb00e-1d95-405a-bb4f-6b35a27c582e', 'page', 1, 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p02.mp3', 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p02.marks.json', 'danielle', 'long-form', 85, 7100),
  ('c5bbb00e-1d95-405a-bb4f-6b35a27c582e', 'page', 2, 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p03.mp3', 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p03.marks.json', 'danielle', 'long-form', 85, 3260),
  ('c5bbb00e-1d95-405a-bb4f-6b35a27c582e', 'page', 3, 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p04.mp3', 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p04.marks.json', 'danielle', 'long-form', 85, 7080),
  ('c5bbb00e-1d95-405a-bb4f-6b35a27c582e', 'page', 4, 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p05.mp3', 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p05.marks.json', 'danielle', 'long-form', 85, 9070),
  ('c5bbb00e-1d95-405a-bb4f-6b35a27c582e', 'page', 5, 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p06.mp3', 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p06.marks.json', 'danielle', 'long-form', 85, 16390),
  ('c5bbb00e-1d95-405a-bb4f-6b35a27c582e', 'page', 6, 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p07.mp3', 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p07.marks.json', 'danielle', 'long-form', 85, 22920),
  ('c5bbb00e-1d95-405a-bb4f-6b35a27c582e', 'page', 7, 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p08.mp3', 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p08.marks.json', 'danielle', 'long-form', 85, 21120),
  ('c5bbb00e-1d95-405a-bb4f-6b35a27c582e', 'page', 8, 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p09.mp3', 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p09.marks.json', 'danielle', 'long-form', 85, 19460),
  ('c5bbb00e-1d95-405a-bb4f-6b35a27c582e', 'page', 9, 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p10.mp3', 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p10.marks.json', 'danielle', 'long-form', 85, 10180),
  ('c5bbb00e-1d95-405a-bb4f-6b35a27c582e', 'page', 10, 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p11.mp3', 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p11.marks.json', 'danielle', 'long-form', 85, 13510),
  ('c5bbb00e-1d95-405a-bb4f-6b35a27c582e', 'page', 11, 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p12.mp3', 'book_dash-ann-nem-oh-nee-finds-adventure/danielle/p12.marks.json', 'danielle', 'long-form', 85, 3910),
  -- auntie-bois-gift (12면)
  ('6e802972-1993-4171-82e0-4c989d19f97a', 'page', 0, 'book_dash-auntie-bois-gift/danielle/p01.mp3', 'book_dash-auntie-bois-gift/danielle/p01.marks.json', 'danielle', 'long-form', 85, 5380),
  ('6e802972-1993-4171-82e0-4c989d19f97a', 'page', 1, 'book_dash-auntie-bois-gift/danielle/p02.mp3', 'book_dash-auntie-bois-gift/danielle/p02.marks.json', 'danielle', 'long-form', 85, 16660),
  ('6e802972-1993-4171-82e0-4c989d19f97a', 'page', 2, 'book_dash-auntie-bois-gift/danielle/p03.mp3', 'book_dash-auntie-bois-gift/danielle/p03.marks.json', 'danielle', 'long-form', 85, 11350),
  ('6e802972-1993-4171-82e0-4c989d19f97a', 'page', 3, 'book_dash-auntie-bois-gift/danielle/p04.mp3', 'book_dash-auntie-bois-gift/danielle/p04.marks.json', 'danielle', 'long-form', 85, 13100),
  ('6e802972-1993-4171-82e0-4c989d19f97a', 'page', 4, 'book_dash-auntie-bois-gift/danielle/p05.mp3', 'book_dash-auntie-bois-gift/danielle/p05.marks.json', 'danielle', 'long-form', 85, 13270),
  ('6e802972-1993-4171-82e0-4c989d19f97a', 'page', 5, 'book_dash-auntie-bois-gift/danielle/p06.mp3', 'book_dash-auntie-bois-gift/danielle/p06.marks.json', 'danielle', 'long-form', 85, 13370),
  ('6e802972-1993-4171-82e0-4c989d19f97a', 'page', 6, 'book_dash-auntie-bois-gift/danielle/p07.mp3', 'book_dash-auntie-bois-gift/danielle/p07.marks.json', 'danielle', 'long-form', 85, 16059),
  ('6e802972-1993-4171-82e0-4c989d19f97a', 'page', 7, 'book_dash-auntie-bois-gift/danielle/p08.mp3', 'book_dash-auntie-bois-gift/danielle/p08.marks.json', 'danielle', 'long-form', 85, 3120),
  ('6e802972-1993-4171-82e0-4c989d19f97a', 'page', 8, 'book_dash-auntie-bois-gift/danielle/p09.mp3', 'book_dash-auntie-bois-gift/danielle/p09.marks.json', 'danielle', 'long-form', 85, 33480),
  ('6e802972-1993-4171-82e0-4c989d19f97a', 'page', 9, 'book_dash-auntie-bois-gift/danielle/p10.mp3', 'book_dash-auntie-bois-gift/danielle/p10.marks.json', 'danielle', 'long-form', 85, 7220),
  ('6e802972-1993-4171-82e0-4c989d19f97a', 'page', 10, 'book_dash-auntie-bois-gift/danielle/p11.mp3', 'book_dash-auntie-bois-gift/danielle/p11.marks.json', 'danielle', 'long-form', 85, 12670),
  ('6e802972-1993-4171-82e0-4c989d19f97a', 'page', 11, 'book_dash-auntie-bois-gift/danielle/p12.mp3', 'book_dash-auntie-bois-gift/danielle/p12.marks.json', 'danielle', 'long-form', 85, 4750),
  -- baby-babble (12면)
  ('22a4f65f-df39-44c3-863f-81d7855e35c0', 'page', 0, 'book_dash-baby-babble/danielle/p01.mp3', 'book_dash-baby-babble/danielle/p01.marks.json', 'danielle', 'long-form', 85, 2950),
  ('22a4f65f-df39-44c3-863f-81d7855e35c0', 'page', 1, 'book_dash-baby-babble/danielle/p02.mp3', 'book_dash-baby-babble/danielle/p02.marks.json', 'danielle', 'long-form', 85, 3500),
  ('22a4f65f-df39-44c3-863f-81d7855e35c0', 'page', 2, 'book_dash-baby-babble/danielle/p03.mp3', 'book_dash-baby-babble/danielle/p03.marks.json', 'danielle', 'long-form', 85, 2640),
  ('22a4f65f-df39-44c3-863f-81d7855e35c0', 'page', 3, 'book_dash-baby-babble/danielle/p04.mp3', 'book_dash-baby-babble/danielle/p04.marks.json', 'danielle', 'long-form', 85, 2690),
  ('22a4f65f-df39-44c3-863f-81d7855e35c0', 'page', 4, 'book_dash-baby-babble/danielle/p05.mp3', 'book_dash-baby-babble/danielle/p05.marks.json', 'danielle', 'long-form', 85, 4200),
  ('22a4f65f-df39-44c3-863f-81d7855e35c0', 'page', 5, 'book_dash-baby-babble/danielle/p06.mp3', 'book_dash-baby-babble/danielle/p06.marks.json', 'danielle', 'long-form', 85, 3310),
  ('22a4f65f-df39-44c3-863f-81d7855e35c0', 'page', 6, 'book_dash-baby-babble/danielle/p07.mp3', 'book_dash-baby-babble/danielle/p07.marks.json', 'danielle', 'long-form', 85, 1680),
  ('22a4f65f-df39-44c3-863f-81d7855e35c0', 'page', 7, 'book_dash-baby-babble/danielle/p08.mp3', 'book_dash-baby-babble/danielle/p08.marks.json', 'danielle', 'long-form', 85, 1820),
  ('22a4f65f-df39-44c3-863f-81d7855e35c0', 'page', 8, 'book_dash-baby-babble/danielle/p09.mp3', 'book_dash-baby-babble/danielle/p09.marks.json', 'danielle', 'long-form', 85, 3700),
  ('22a4f65f-df39-44c3-863f-81d7855e35c0', 'page', 9, 'book_dash-baby-babble/danielle/p10.mp3', 'book_dash-baby-babble/danielle/p10.marks.json', 'danielle', 'long-form', 85, 3340),
  ('22a4f65f-df39-44c3-863f-81d7855e35c0', 'page', 10, 'book_dash-baby-babble/danielle/p11.mp3', 'book_dash-baby-babble/danielle/p11.marks.json', 'danielle', 'long-form', 85, 4270),
  ('22a4f65f-df39-44c3-863f-81d7855e35c0', 'page', 11, 'book_dash-baby-babble/danielle/p12.mp3', 'book_dash-baby-babble/danielle/p12.marks.json', 'danielle', 'long-form', 85, 2930),
  -- baby-talk (12면)
  ('ecd263ae-03ed-4be9-bc7b-29392fc9bbc1', 'page', 0, 'book_dash-baby-talk/danielle/p01.mp3', 'book_dash-baby-talk/danielle/p01.marks.json', 'danielle', 'long-form', 85, 7920),
  ('ecd263ae-03ed-4be9-bc7b-29392fc9bbc1', 'page', 1, 'book_dash-baby-talk/danielle/p02.mp3', 'book_dash-baby-talk/danielle/p02.marks.json', 'danielle', 'long-form', 85, 9480),
  ('ecd263ae-03ed-4be9-bc7b-29392fc9bbc1', 'page', 2, 'book_dash-baby-talk/danielle/p03.mp3', 'book_dash-baby-talk/danielle/p03.marks.json', 'danielle', 'long-form', 85, 6170),
  ('ecd263ae-03ed-4be9-bc7b-29392fc9bbc1', 'page', 3, 'book_dash-baby-talk/danielle/p04.mp3', 'book_dash-baby-talk/danielle/p04.marks.json', 'danielle', 'long-form', 85, 8620),
  ('ecd263ae-03ed-4be9-bc7b-29392fc9bbc1', 'page', 4, 'book_dash-baby-talk/danielle/p05.mp3', 'book_dash-baby-talk/danielle/p05.marks.json', 'danielle', 'long-form', 85, 6360),
  ('ecd263ae-03ed-4be9-bc7b-29392fc9bbc1', 'page', 5, 'book_dash-baby-talk/danielle/p06.mp3', 'book_dash-baby-talk/danielle/p06.marks.json', 'danielle', 'long-form', 85, 10800),
  ('ecd263ae-03ed-4be9-bc7b-29392fc9bbc1', 'page', 6, 'book_dash-baby-talk/danielle/p07.mp3', 'book_dash-baby-talk/danielle/p07.marks.json', 'danielle', 'long-form', 85, 1150),
  ('ecd263ae-03ed-4be9-bc7b-29392fc9bbc1', 'page', 7, 'book_dash-baby-talk/danielle/p08.mp3', 'book_dash-baby-talk/danielle/p08.marks.json', 'danielle', 'long-form', 85, 12530),
  ('ecd263ae-03ed-4be9-bc7b-29392fc9bbc1', 'page', 8, 'book_dash-baby-talk/danielle/p09.mp3', 'book_dash-baby-talk/danielle/p09.marks.json', 'danielle', 'long-form', 85, 10390),
  ('ecd263ae-03ed-4be9-bc7b-29392fc9bbc1', 'page', 9, 'book_dash-baby-talk/danielle/p10.mp3', 'book_dash-baby-talk/danielle/p10.marks.json', 'danielle', 'long-form', 85, 11180),
  ('ecd263ae-03ed-4be9-bc7b-29392fc9bbc1', 'page', 10, 'book_dash-baby-talk/danielle/p11.mp3', 'book_dash-baby-talk/danielle/p11.marks.json', 'danielle', 'long-form', 85, 7080),
  ('ecd263ae-03ed-4be9-bc7b-29392fc9bbc1', 'page', 11, 'book_dash-baby-talk/danielle/p12.mp3', 'book_dash-baby-talk/danielle/p12.marks.json', 'danielle', 'long-form', 85, 6290),
  -- babys-first-family-photo (11면)
  ('b799bdd3-5278-4e81-afca-71e1c04dc32d', 'page', 0, 'book_dash-babys-first-family-photo/danielle/p01.mp3', 'book_dash-babys-first-family-photo/danielle/p01.marks.json', 'danielle', 'long-form', 85, 4700),
  ('b799bdd3-5278-4e81-afca-71e1c04dc32d', 'page', 1, 'book_dash-babys-first-family-photo/danielle/p02.mp3', 'book_dash-babys-first-family-photo/danielle/p02.marks.json', 'danielle', 'long-form', 85, 4490),
  ('b799bdd3-5278-4e81-afca-71e1c04dc32d', 'page', 2, 'book_dash-babys-first-family-photo/danielle/p03.mp3', 'book_dash-babys-first-family-photo/danielle/p03.marks.json', 'danielle', 'long-form', 85, 4390),
  ('b799bdd3-5278-4e81-afca-71e1c04dc32d', 'page', 3, 'book_dash-babys-first-family-photo/danielle/p04.mp3', 'book_dash-babys-first-family-photo/danielle/p04.marks.json', 'danielle', 'long-form', 85, 5280),
  ('b799bdd3-5278-4e81-afca-71e1c04dc32d', 'page', 4, 'book_dash-babys-first-family-photo/danielle/p05.mp3', 'book_dash-babys-first-family-photo/danielle/p05.marks.json', 'danielle', 'long-form', 85, 5540),
  ('b799bdd3-5278-4e81-afca-71e1c04dc32d', 'page', 5, 'book_dash-babys-first-family-photo/danielle/p06.mp3', 'book_dash-babys-first-family-photo/danielle/p06.marks.json', 'danielle', 'long-form', 85, 4780),
  ('b799bdd3-5278-4e81-afca-71e1c04dc32d', 'page', 6, 'book_dash-babys-first-family-photo/danielle/p07.mp3', 'book_dash-babys-first-family-photo/danielle/p07.marks.json', 'danielle', 'long-form', 85, 3940),
  ('b799bdd3-5278-4e81-afca-71e1c04dc32d', 'page', 7, 'book_dash-babys-first-family-photo/danielle/p08.mp3', 'book_dash-babys-first-family-photo/danielle/p08.marks.json', 'danielle', 'long-form', 85, 4630),
  ('b799bdd3-5278-4e81-afca-71e1c04dc32d', 'page', 8, 'book_dash-babys-first-family-photo/danielle/p09.mp3', 'book_dash-babys-first-family-photo/danielle/p09.marks.json', 'danielle', 'long-form', 85, 6410),
  ('b799bdd3-5278-4e81-afca-71e1c04dc32d', 'page', 9, 'book_dash-babys-first-family-photo/danielle/p10.mp3', 'book_dash-babys-first-family-photo/danielle/p10.marks.json', 'danielle', 'long-form', 85, 5350),
  ('b799bdd3-5278-4e81-afca-71e1c04dc32d', 'page', 10, 'book_dash-babys-first-family-photo/danielle/p11.mp3', 'book_dash-babys-first-family-photo/danielle/p11.marks.json', 'danielle', 'long-form', 85, 2810),
  -- banzis-busy-bees (12면)
  ('aaf10a7e-6b50-4840-8999-3f2c76a2c731', 'page', 0, 'book_dash-banzis-busy-bees/danielle/p01.mp3', 'book_dash-banzis-busy-bees/danielle/p01.marks.json', 'danielle', 'long-form', 85, 13100),
  ('aaf10a7e-6b50-4840-8999-3f2c76a2c731', 'page', 1, 'book_dash-banzis-busy-bees/danielle/p02.mp3', 'book_dash-banzis-busy-bees/danielle/p02.marks.json', 'danielle', 'long-form', 85, 12820),
  ('aaf10a7e-6b50-4840-8999-3f2c76a2c731', 'page', 2, 'book_dash-banzis-busy-bees/danielle/p03.mp3', 'book_dash-banzis-busy-bees/danielle/p03.marks.json', 'danielle', 'long-form', 85, 12530),
  ('aaf10a7e-6b50-4840-8999-3f2c76a2c731', 'page', 3, 'book_dash-banzis-busy-bees/danielle/p04.mp3', 'book_dash-banzis-busy-bees/danielle/p04.marks.json', 'danielle', 'long-form', 85, 10560),
  ('aaf10a7e-6b50-4840-8999-3f2c76a2c731', 'page', 4, 'book_dash-banzis-busy-bees/danielle/p05.mp3', 'book_dash-banzis-busy-bees/danielle/p05.marks.json', 'danielle', 'long-form', 85, 15600),
  ('aaf10a7e-6b50-4840-8999-3f2c76a2c731', 'page', 5, 'book_dash-banzis-busy-bees/danielle/p06.mp3', 'book_dash-banzis-busy-bees/danielle/p06.marks.json', 'danielle', 'long-form', 85, 13560),
  ('aaf10a7e-6b50-4840-8999-3f2c76a2c731', 'page', 6, 'book_dash-banzis-busy-bees/danielle/p07.mp3', 'book_dash-banzis-busy-bees/danielle/p07.marks.json', 'danielle', 'long-form', 85, 6890),
  ('aaf10a7e-6b50-4840-8999-3f2c76a2c731', 'page', 7, 'book_dash-banzis-busy-bees/danielle/p08.mp3', 'book_dash-banzis-busy-bees/danielle/p08.marks.json', 'danielle', 'long-form', 85, 25490),
  ('aaf10a7e-6b50-4840-8999-3f2c76a2c731', 'page', 8, 'book_dash-banzis-busy-bees/danielle/p09.mp3', 'book_dash-banzis-busy-bees/danielle/p09.marks.json', 'danielle', 'long-form', 85, 5180),
  ('aaf10a7e-6b50-4840-8999-3f2c76a2c731', 'page', 9, 'book_dash-banzis-busy-bees/danielle/p10.mp3', 'book_dash-banzis-busy-bees/danielle/p10.marks.json', 'danielle', 'long-form', 85, 1780),
  ('aaf10a7e-6b50-4840-8999-3f2c76a2c731', 'page', 10, 'book_dash-banzis-busy-bees/danielle/p11.mp3', 'book_dash-banzis-busy-bees/danielle/p11.marks.json', 'danielle', 'long-form', 85, 1780),
  ('aaf10a7e-6b50-4840-8999-3f2c76a2c731', 'page', 11, 'book_dash-banzis-busy-bees/danielle/p12.mp3', 'book_dash-banzis-busy-bees/danielle/p12.marks.json', 'danielle', 'long-form', 85, 7580);
ON CONFLICT (book_id, kind, page_index, voice) DO UPDATE SET
  audio_path  = EXCLUDED.audio_path,
  marks_path  = EXCLUDED.marks_path,
  engine      = EXCLUDED.engine,
  rate        = EXCLUDED.rate,
  duration_ms = EXCLUDED.duration_ms;

-- 검증: 기대 138행
SELECT count(*) AS inserted_rows
  FROM public.book_audio
 WHERE voice = 'danielle' AND kind = 'page';

-- 검증: 권별 면 수 (기대 = 아래 주석 값)
--   a-day-out                        8
--   a-trip-to-the-tap                12
--   a-very-busy-day                  11
--   aaaaahhh-mmawe                   12
--   alexs-super-medicine             12
--   amahle-wants-to-help             12
--   ann-nem-oh-nee-finds-adventure   12
--   auntie-bois-gift                 12
--   baby-babble                      12
--   baby-talk                        12
--   babys-first-family-photo         11
--   banzis-busy-bees                 12
SELECT b.source_id AS slug, count(*) AS pages
  FROM public.book_audio a JOIN public.books b ON b.id = a.book_id
 WHERE a.voice = 'danielle' AND a.kind = 'page'
 GROUP BY b.source_id ORDER BY b.source_id;

-- ============================================================
-- [2] books.has_audio = true (12권)
-- ============================================================
UPDATE public.books SET has_audio = true
 WHERE id IN (
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
 );

-- 검증: 기대 12
SELECT count(*) AS has_audio_true FROM public.books
 WHERE has_audio = true AND id IN (
   'cf26dae0-eba7-40bb-a4d4-6242b379c1ba',
   '0134f341-7b58-4c7c-b17a-8d4e036dcd72',
   '3e219305-97f9-49a7-8a80-0c6767145af7',
   '87069ecb-b546-4cbe-b8b4-bca723b43f12',
   '2866e4c4-22f2-4acc-a12c-b88552820fe6',
   'f3e5da2f-a04d-4b08-ac81-4dee971c15e8',
   'c5bbb00e-1d95-405a-bb4f-6b35a27c582e',
   '6e802972-1993-4171-82e0-4c989d19f97a',
   '22a4f65f-df39-44c3-863f-81d7855e35c0',
   'ecd263ae-03ed-4be9-bc7b-29392fc9bbc1',
   'b799bdd3-5278-4e81-afca-71e1c04dc32d',
   'aaf10a7e-6b50-4840-8999-3f2c76a2c731'
 );

-- ============================================================
-- [3] book_review.status: confirmed → tts_done (12권)
-- ============================================================
-- ADR-0046 D6: status 4단계(draft/in_review/confirmed/tts_done).
-- 공개 여부의 단일진실은 books.is_active이며 본 SQL은 is_active를 건드리지 않는다.
UPDATE public.book_review SET status = 'tts_done'
 WHERE status = 'confirmed'
   AND book_id IN (
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
   );

-- 검증: 기대 12
SELECT count(*) AS tts_done_rows FROM public.book_review
 WHERE status = 'tts_done' AND book_id IN (
   'cf26dae0-eba7-40bb-a4d4-6242b379c1ba',
   '0134f341-7b58-4c7c-b17a-8d4e036dcd72',
   '3e219305-97f9-49a7-8a80-0c6767145af7',
   '87069ecb-b546-4cbe-b8b4-bca723b43f12',
   '2866e4c4-22f2-4acc-a12c-b88552820fe6',
   'f3e5da2f-a04d-4b08-ac81-4dee971c15e8',
   'c5bbb00e-1d95-405a-bb4f-6b35a27c582e',
   '6e802972-1993-4171-82e0-4c989d19f97a',
   '22a4f65f-df39-44c3-863f-81d7855e35c0',
   'ecd263ae-03ed-4be9-bc7b-29392fc9bbc1',
   'b799bdd3-5278-4e81-afca-71e1c04dc32d',
   'aaf10a7e-6b50-4840-8999-3f2c76a2c731'
 );

-- 전부 기대값과 일치하면 COMMIT, 아니면 ROLLBACK.
-- COMMIT;
ROLLBACK;  -- ← 기본은 ROLLBACK. 검증 통과 확인 후 이 줄을 COMMIT; 으로 바꿔 재실행할 것.
