-- load708_step3_bookdash.sql — 708권 Danielle 오디오 book_audio 적재 · step3 (book_dash)
-- 생성: scripts/tts_pilot/gen_book_audio_sql_708.py (워커, DB 접속 0건)
-- 근거: ADR-0053 D4(전량 확장) / ADR-0034(결정 ①②③ + Amd#1 kind · Amd#2 성우 층위)
--       / ADR-0052 D5(page_index 축) · Amd#2(rate 의미) · D8(워커 DB 직접 쓰기 금지)
--
-- ★★ 이 파일은 끝이 ROLLBACK; 이다. 그대로 실행하면 **아무것도 남지 않는다**. ★★
--    검증 SELECT 결과가 전부 기대값과 같으면, 맨 끝 ROLLBACK; 을 COMMIT; 으로
--    직접 고쳐 타이핑한 뒤 다시 실행할 것. (자동 COMMIT 금지 — 팀장 확인 영역)
--
-- ※ Supabase SQL Editor는 스크립트를 자체 트랜잭션으로 감싸는 경우가 있어 BEGIN에서
--   'there is already a transaction in progress' WARNING이 뜰 수 있다. 경고이지 에러가
--   아니며 ROLLBACK/COMMIT은 정상 동작한다. ERROR 로 시작하는 줄만 실패로 취급할 것.
-- ※ [3]·[4]의 DO 블록은 fail-closed 가드다. 여기서 STOP이 뜨면 트랜잭션이 죽고 이후
--   문장이 'current transaction is aborted'로 줄줄이 실패한다 — 정상 동작이다.
--   맨 처음 뜬 STOP 메시지만 워커에게 전달하면 된다.
--
-- ★ 선행 조건: Storage 업로드 폐합 완료(성공 15,888 + 스킵 68 = 15,956, 실패 0).
--   audio_path가 가리키는 오브젝트가 없으면 행만 생기고 재생이 깨진다.
--   본 SQL 생성 시 매니페스트 ↔ 업로드 체크포인트 1:1 대조를 통과했다.
--
-- 규모: 39권 / 507행 (page 468 + cover 39)
-- 값  : voice='danielle' · engine='long-form' · rate=85 (atempo 0.85의 실효 속도, SSML prosody 아님)
--        duration_ms = 감속 후 mp3 실측(ffmpeg). 마크 프록시 아님. NULL 0행.
--        audio_path/marks_path = 버킷명 미포함 **오브젝트 키만** (ADR-0034)
--
-- page_index 축: 파일명 pNN은 1-based, 컬럼 page_index는 0-based → page_index = NN - 1.
--   표지는 page_index=0 고정 placeholder이며 kind='cover'로 본문 첫 면과 구분된다
--   (UNIQUE에 kind 포함 — ADR-0034 Amd#1).
--
-- 기존 행 보호:
--   · 기존 danielle 128권(1614행)과 교집합 0 — 로컬 산출물 대조 확인. 아래 [4]에서 DB로 재확인한다.
--   · 구 44권은 voice='Ruth'라 UNIQUE에서 자연 분리 — 건드리지 않는다.
--   · INSERT 는 ON CONFLICT 절이 **없다**. 충돌이 있으면 에러로 죽는다(=덮어쓰기 불가).
--     이것이 의도다 — 기존 행 무접촉을 SQL 레벨에서 보장한다.
--
-- SQL Editor 표시 100행 제한 대응: 모든 검증문을 COUNT 기반으로 작성했다(행 나열 없음).

BEGIN;

-- ============================================================
-- [0] 사전 상태 스냅샷 — 적재 전 기준값
-- ============================================================
-- 기대: danielle_books 797 / danielle_rows 9085 / page 8288 / cover 797
--   (step1 기준값은 pilot12+fullbatch116 = 128권 1614행. step2/step3는 앞 step COMMIT 반영값)
--   이 수치가 다르면 즉시 중단하고 원인을 확인할 것(앞 step 미실행? 중복 실행?).
SELECT count(DISTINCT book_id) AS danielle_books,
       count(*)                               AS danielle_rows,
       count(*) FILTER (WHERE kind = 'page')  AS page_rows,
       count(*) FILTER (WHERE kind = 'cover') AS cover_rows
  FROM public.book_audio WHERE voice = 'danielle';

-- 구 44권(voice='Ruth') 기준값 — 본 적재 무간섭을 사후 대조할 값
-- 기대: ruth_books 44 / ruth_rows 574
SELECT count(DISTINCT book_id) AS ruth_books, count(*) AS ruth_rows
  FROM public.book_audio WHERE voice = 'Ruth';

-- ============================================================
-- [1] 스테이징 — 507행을 임시 테이블에 올린다 (ON COMMIT DROP)
-- ============================================================
-- book_id를 VALUES에 직접 박지 않는다. (source_platform, source_id)로 books를 조인해
-- 얻고, 매니페스트가 기록한 book_id와 일치하는지 [3]에서 대조한다.
CREATE TEMP TABLE _stage_load708_step3 (
  source_platform  text NOT NULL,
  source_id        text NOT NULL,
  manifest_book_id uuid NOT NULL,
  kind             text NOT NULL,
  page_index       int  NOT NULL,
  audio_path       text NOT NULL,
  marks_path       text,
  duration_ms      int  NOT NULL
) ON COMMIT DROP;

INSERT INTO _stage_load708_step3
  (source_platform, source_id, manifest_book_id, kind, page_index, audio_path, marks_path, duration_ms)
VALUES
  -- book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e55de-fe46-11e5-86aa-5e5517507c66', 'bc79b86e-09c9-4bc4-898f-3653f0cafa45', 'cover', 0, 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 8690),
  ('book_dash', '9c9e55de-fe46-11e5-86aa-5e5517507c66', 'bc79b86e-09c9-4bc4-898f-3653f0cafa45', 'page', 0, 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 12240),
  ('book_dash', '9c9e55de-fe46-11e5-86aa-5e5517507c66', 'bc79b86e-09c9-4bc4-898f-3653f0cafa45', 'page', 1, 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 10850),
  ('book_dash', '9c9e55de-fe46-11e5-86aa-5e5517507c66', 'bc79b86e-09c9-4bc4-898f-3653f0cafa45', 'page', 2, 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 6170),
  ('book_dash', '9c9e55de-fe46-11e5-86aa-5e5517507c66', 'bc79b86e-09c9-4bc4-898f-3653f0cafa45', 'page', 3, 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 6170),
  ('book_dash', '9c9e55de-fe46-11e5-86aa-5e5517507c66', 'bc79b86e-09c9-4bc4-898f-3653f0cafa45', 'page', 4, 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 6480),
  ('book_dash', '9c9e55de-fe46-11e5-86aa-5e5517507c66', 'bc79b86e-09c9-4bc4-898f-3653f0cafa45', 'page', 5, 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 13220),
  ('book_dash', '9c9e55de-fe46-11e5-86aa-5e5517507c66', 'bc79b86e-09c9-4bc4-898f-3653f0cafa45', 'page', 6, 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 6360),
  ('book_dash', '9c9e55de-fe46-11e5-86aa-5e5517507c66', 'bc79b86e-09c9-4bc4-898f-3653f0cafa45', 'page', 7, 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 4180),
  ('book_dash', '9c9e55de-fe46-11e5-86aa-5e5517507c66', 'bc79b86e-09c9-4bc4-898f-3653f0cafa45', 'page', 8, 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 6190),
  ('book_dash', '9c9e55de-fe46-11e5-86aa-5e5517507c66', 'bc79b86e-09c9-4bc4-898f-3653f0cafa45', 'page', 9, 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 7340),
  ('book_dash', '9c9e55de-fe46-11e5-86aa-5e5517507c66', 'bc79b86e-09c9-4bc4-898f-3653f0cafa45', 'page', 10, 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 3310),
  ('book_dash', '9c9e55de-fe46-11e5-86aa-5e5517507c66', 'bc79b86e-09c9-4bc4-898f-3653f0cafa45', 'page', 11, 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e55de-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 10970),
  -- book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e596c-fe46-11e5-86aa-5e5517507c66', '96f3031c-b429-4b93-9797-8fb821b5211c', 'cover', 0, 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 10390),
  ('book_dash', '9c9e596c-fe46-11e5-86aa-5e5517507c66', '96f3031c-b429-4b93-9797-8fb821b5211c', 'page', 0, 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 13370),
  ('book_dash', '9c9e596c-fe46-11e5-86aa-5e5517507c66', '96f3031c-b429-4b93-9797-8fb821b5211c', 'page', 1, 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 14930),
  ('book_dash', '9c9e596c-fe46-11e5-86aa-5e5517507c66', '96f3031c-b429-4b93-9797-8fb821b5211c', 'page', 2, 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 5330),
  ('book_dash', '9c9e596c-fe46-11e5-86aa-5e5517507c66', '96f3031c-b429-4b93-9797-8fb821b5211c', 'page', 3, 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 18600),
  ('book_dash', '9c9e596c-fe46-11e5-86aa-5e5517507c66', '96f3031c-b429-4b93-9797-8fb821b5211c', 'page', 4, 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 22540),
  ('book_dash', '9c9e596c-fe46-11e5-86aa-5e5517507c66', '96f3031c-b429-4b93-9797-8fb821b5211c', 'page', 5, 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 13700),
  ('book_dash', '9c9e596c-fe46-11e5-86aa-5e5517507c66', '96f3031c-b429-4b93-9797-8fb821b5211c', 'page', 6, 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 19200),
  ('book_dash', '9c9e596c-fe46-11e5-86aa-5e5517507c66', '96f3031c-b429-4b93-9797-8fb821b5211c', 'page', 7, 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 9260),
  ('book_dash', '9c9e596c-fe46-11e5-86aa-5e5517507c66', '96f3031c-b429-4b93-9797-8fb821b5211c', 'page', 8, 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 12460),
  ('book_dash', '9c9e596c-fe46-11e5-86aa-5e5517507c66', '96f3031c-b429-4b93-9797-8fb821b5211c', 'page', 9, 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 22940),
  ('book_dash', '9c9e596c-fe46-11e5-86aa-5e5517507c66', '96f3031c-b429-4b93-9797-8fb821b5211c', 'page', 10, 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 21790),
  ('book_dash', '9c9e596c-fe46-11e5-86aa-5e5517507c66', '96f3031c-b429-4b93-9797-8fb821b5211c', 'page', 11, 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e596c-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 17880),
  -- book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e5f48-fe46-11e5-86aa-5e5517507c66', 'e54b29d1-1992-4474-a0b9-7adbc3d13ed5', 'cover', 0, 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 7990),
  ('book_dash', '9c9e5f48-fe46-11e5-86aa-5e5517507c66', 'e54b29d1-1992-4474-a0b9-7adbc3d13ed5', 'page', 0, 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 11330),
  ('book_dash', '9c9e5f48-fe46-11e5-86aa-5e5517507c66', 'e54b29d1-1992-4474-a0b9-7adbc3d13ed5', 'page', 1, 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 13610),
  ('book_dash', '9c9e5f48-fe46-11e5-86aa-5e5517507c66', 'e54b29d1-1992-4474-a0b9-7adbc3d13ed5', 'page', 2, 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 15860),
  ('book_dash', '9c9e5f48-fe46-11e5-86aa-5e5517507c66', 'e54b29d1-1992-4474-a0b9-7adbc3d13ed5', 'page', 3, 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 17500),
  ('book_dash', '9c9e5f48-fe46-11e5-86aa-5e5517507c66', 'e54b29d1-1992-4474-a0b9-7adbc3d13ed5', 'page', 4, 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 7130),
  ('book_dash', '9c9e5f48-fe46-11e5-86aa-5e5517507c66', 'e54b29d1-1992-4474-a0b9-7adbc3d13ed5', 'page', 5, 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 6770),
  ('book_dash', '9c9e5f48-fe46-11e5-86aa-5e5517507c66', 'e54b29d1-1992-4474-a0b9-7adbc3d13ed5', 'page', 6, 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 2570),
  ('book_dash', '9c9e5f48-fe46-11e5-86aa-5e5517507c66', 'e54b29d1-1992-4474-a0b9-7adbc3d13ed5', 'page', 7, 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 6460),
  ('book_dash', '9c9e5f48-fe46-11e5-86aa-5e5517507c66', 'e54b29d1-1992-4474-a0b9-7adbc3d13ed5', 'page', 8, 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 3000),
  ('book_dash', '9c9e5f48-fe46-11e5-86aa-5e5517507c66', 'e54b29d1-1992-4474-a0b9-7adbc3d13ed5', 'page', 9, 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 3550),
  ('book_dash', '9c9e5f48-fe46-11e5-86aa-5e5517507c66', 'e54b29d1-1992-4474-a0b9-7adbc3d13ed5', 'page', 10, 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 23400),
  ('book_dash', '9c9e5f48-fe46-11e5-86aa-5e5517507c66', 'e54b29d1-1992-4474-a0b9-7adbc3d13ed5', 'page', 11, 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e5f48-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 11090),
  -- book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e6196-fe46-11e5-86aa-5e5517507c66', 'a8ee34b2-3b55-407b-9630-c91e3acf3e0e', 'cover', 0, 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 9140),
  ('book_dash', '9c9e6196-fe46-11e5-86aa-5e5517507c66', 'a8ee34b2-3b55-407b-9630-c91e3acf3e0e', 'page', 0, 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 22270),
  ('book_dash', '9c9e6196-fe46-11e5-86aa-5e5517507c66', 'a8ee34b2-3b55-407b-9630-c91e3acf3e0e', 'page', 1, 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 21790),
  ('book_dash', '9c9e6196-fe46-11e5-86aa-5e5517507c66', 'a8ee34b2-3b55-407b-9630-c91e3acf3e0e', 'page', 2, 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 28630),
  ('book_dash', '9c9e6196-fe46-11e5-86aa-5e5517507c66', 'a8ee34b2-3b55-407b-9630-c91e3acf3e0e', 'page', 3, 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 27170),
  ('book_dash', '9c9e6196-fe46-11e5-86aa-5e5517507c66', 'a8ee34b2-3b55-407b-9630-c91e3acf3e0e', 'page', 4, 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 21000),
  ('book_dash', '9c9e6196-fe46-11e5-86aa-5e5517507c66', 'a8ee34b2-3b55-407b-9630-c91e3acf3e0e', 'page', 5, 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 25730),
  ('book_dash', '9c9e6196-fe46-11e5-86aa-5e5517507c66', 'a8ee34b2-3b55-407b-9630-c91e3acf3e0e', 'page', 6, 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 24070),
  ('book_dash', '9c9e6196-fe46-11e5-86aa-5e5517507c66', 'a8ee34b2-3b55-407b-9630-c91e3acf3e0e', 'page', 7, 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 44450),
  ('book_dash', '9c9e6196-fe46-11e5-86aa-5e5517507c66', 'a8ee34b2-3b55-407b-9630-c91e3acf3e0e', 'page', 8, 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 40750),
  ('book_dash', '9c9e6196-fe46-11e5-86aa-5e5517507c66', 'a8ee34b2-3b55-407b-9630-c91e3acf3e0e', 'page', 9, 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 37080),
  ('book_dash', '9c9e6196-fe46-11e5-86aa-5e5517507c66', 'a8ee34b2-3b55-407b-9630-c91e3acf3e0e', 'page', 10, 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 32710),
  ('book_dash', '9c9e6196-fe46-11e5-86aa-5e5517507c66', 'a8ee34b2-3b55-407b-9630-c91e3acf3e0e', 'page', 11, 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e6196-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 29140),
  -- book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e62ea-fe46-11e5-86aa-5e5517507c66', 'b0e7471b-01e1-41f1-acc3-0ed1d0a7c9c2', 'cover', 0, 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 8160),
  ('book_dash', '9c9e62ea-fe46-11e5-86aa-5e5517507c66', 'b0e7471b-01e1-41f1-acc3-0ed1d0a7c9c2', 'page', 0, 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 13850),
  ('book_dash', '9c9e62ea-fe46-11e5-86aa-5e5517507c66', 'b0e7471b-01e1-41f1-acc3-0ed1d0a7c9c2', 'page', 1, 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 15460),
  ('book_dash', '9c9e62ea-fe46-11e5-86aa-5e5517507c66', 'b0e7471b-01e1-41f1-acc3-0ed1d0a7c9c2', 'page', 2, 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 19580),
  ('book_dash', '9c9e62ea-fe46-11e5-86aa-5e5517507c66', 'b0e7471b-01e1-41f1-acc3-0ed1d0a7c9c2', 'page', 3, 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 17690),
  ('book_dash', '9c9e62ea-fe46-11e5-86aa-5e5517507c66', 'b0e7471b-01e1-41f1-acc3-0ed1d0a7c9c2', 'page', 4, 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 12580),
  ('book_dash', '9c9e62ea-fe46-11e5-86aa-5e5517507c66', 'b0e7471b-01e1-41f1-acc3-0ed1d0a7c9c2', 'page', 5, 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 11110),
  ('book_dash', '9c9e62ea-fe46-11e5-86aa-5e5517507c66', 'b0e7471b-01e1-41f1-acc3-0ed1d0a7c9c2', 'page', 6, 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 22900),
  ('book_dash', '9c9e62ea-fe46-11e5-86aa-5e5517507c66', 'b0e7471b-01e1-41f1-acc3-0ed1d0a7c9c2', 'page', 7, 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 17540),
  ('book_dash', '9c9e62ea-fe46-11e5-86aa-5e5517507c66', 'b0e7471b-01e1-41f1-acc3-0ed1d0a7c9c2', 'page', 8, 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 19200),
  ('book_dash', '9c9e62ea-fe46-11e5-86aa-5e5517507c66', 'b0e7471b-01e1-41f1-acc3-0ed1d0a7c9c2', 'page', 9, 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 20300),
  ('book_dash', '9c9e62ea-fe46-11e5-86aa-5e5517507c66', 'b0e7471b-01e1-41f1-acc3-0ed1d0a7c9c2', 'page', 10, 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 16610),
  ('book_dash', '9c9e62ea-fe46-11e5-86aa-5e5517507c66', 'b0e7471b-01e1-41f1-acc3-0ed1d0a7c9c2', 'page', 11, 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e62ea-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 17860),
  -- book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e640c-fe46-11e5-86aa-5e5517507c66', 'cd9286f5-5651-48fe-9419-9021a1a362cd', 'cover', 0, 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 8710),
  ('book_dash', '9c9e640c-fe46-11e5-86aa-5e5517507c66', 'cd9286f5-5651-48fe-9419-9021a1a362cd', 'page', 0, 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 32980),
  ('book_dash', '9c9e640c-fe46-11e5-86aa-5e5517507c66', 'cd9286f5-5651-48fe-9419-9021a1a362cd', 'page', 1, 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 31420),
  ('book_dash', '9c9e640c-fe46-11e5-86aa-5e5517507c66', 'cd9286f5-5651-48fe-9419-9021a1a362cd', 'page', 2, 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 20740),
  ('book_dash', '9c9e640c-fe46-11e5-86aa-5e5517507c66', 'cd9286f5-5651-48fe-9419-9021a1a362cd', 'page', 3, 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 30310),
  ('book_dash', '9c9e640c-fe46-11e5-86aa-5e5517507c66', 'cd9286f5-5651-48fe-9419-9021a1a362cd', 'page', 4, 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 26020),
  ('book_dash', '9c9e640c-fe46-11e5-86aa-5e5517507c66', 'cd9286f5-5651-48fe-9419-9021a1a362cd', 'page', 5, 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 27670),
  ('book_dash', '9c9e640c-fe46-11e5-86aa-5e5517507c66', 'cd9286f5-5651-48fe-9419-9021a1a362cd', 'page', 6, 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 40440),
  ('book_dash', '9c9e640c-fe46-11e5-86aa-5e5517507c66', 'cd9286f5-5651-48fe-9419-9021a1a362cd', 'page', 7, 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 30480),
  ('book_dash', '9c9e640c-fe46-11e5-86aa-5e5517507c66', 'cd9286f5-5651-48fe-9419-9021a1a362cd', 'page', 8, 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 24500),
  ('book_dash', '9c9e640c-fe46-11e5-86aa-5e5517507c66', 'cd9286f5-5651-48fe-9419-9021a1a362cd', 'page', 9, 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 20860),
  ('book_dash', '9c9e640c-fe46-11e5-86aa-5e5517507c66', 'cd9286f5-5651-48fe-9419-9021a1a362cd', 'page', 10, 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 24670),
  ('book_dash', '9c9e640c-fe46-11e5-86aa-5e5517507c66', 'cd9286f5-5651-48fe-9419-9021a1a362cd', 'page', 11, 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e640c-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 31300),
  -- book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e6524-fe46-11e5-86aa-5e5517507c66', 'c0ca9816-36ee-433e-8381-1a1d7712fc3f', 'cover', 0, 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 9530),
  ('book_dash', '9c9e6524-fe46-11e5-86aa-5e5517507c66', 'c0ca9816-36ee-433e-8381-1a1d7712fc3f', 'page', 0, 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 3890),
  ('book_dash', '9c9e6524-fe46-11e5-86aa-5e5517507c66', 'c0ca9816-36ee-433e-8381-1a1d7712fc3f', 'page', 1, 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 8780),
  ('book_dash', '9c9e6524-fe46-11e5-86aa-5e5517507c66', 'c0ca9816-36ee-433e-8381-1a1d7712fc3f', 'page', 2, 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 9070),
  ('book_dash', '9c9e6524-fe46-11e5-86aa-5e5517507c66', 'c0ca9816-36ee-433e-8381-1a1d7712fc3f', 'page', 3, 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 10990),
  ('book_dash', '9c9e6524-fe46-11e5-86aa-5e5517507c66', 'c0ca9816-36ee-433e-8381-1a1d7712fc3f', 'page', 4, 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 10100),
  ('book_dash', '9c9e6524-fe46-11e5-86aa-5e5517507c66', 'c0ca9816-36ee-433e-8381-1a1d7712fc3f', 'page', 5, 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 15220),
  ('book_dash', '9c9e6524-fe46-11e5-86aa-5e5517507c66', 'c0ca9816-36ee-433e-8381-1a1d7712fc3f', 'page', 6, 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 11380),
  ('book_dash', '9c9e6524-fe46-11e5-86aa-5e5517507c66', 'c0ca9816-36ee-433e-8381-1a1d7712fc3f', 'page', 7, 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 3940),
  ('book_dash', '9c9e6524-fe46-11e5-86aa-5e5517507c66', 'c0ca9816-36ee-433e-8381-1a1d7712fc3f', 'page', 8, 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 4900),
  ('book_dash', '9c9e6524-fe46-11e5-86aa-5e5517507c66', 'c0ca9816-36ee-433e-8381-1a1d7712fc3f', 'page', 9, 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 3770),
  ('book_dash', '9c9e6524-fe46-11e5-86aa-5e5517507c66', 'c0ca9816-36ee-433e-8381-1a1d7712fc3f', 'page', 10, 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 4780),
  ('book_dash', '9c9e6524-fe46-11e5-86aa-5e5517507c66', 'c0ca9816-36ee-433e-8381-1a1d7712fc3f', 'page', 11, 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e6524-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 2230),
  -- book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e663c-fe46-11e5-86aa-5e5517507c66', '07afc05a-f7e5-41cb-ad0d-6791a418e570', 'cover', 0, 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 8350),
  ('book_dash', '9c9e663c-fe46-11e5-86aa-5e5517507c66', '07afc05a-f7e5-41cb-ad0d-6791a418e570', 'page', 0, 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 72289),
  ('book_dash', '9c9e663c-fe46-11e5-86aa-5e5517507c66', '07afc05a-f7e5-41cb-ad0d-6791a418e570', 'page', 1, 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 73800),
  ('book_dash', '9c9e663c-fe46-11e5-86aa-5e5517507c66', '07afc05a-f7e5-41cb-ad0d-6791a418e570', 'page', 2, 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 73610),
  ('book_dash', '9c9e663c-fe46-11e5-86aa-5e5517507c66', '07afc05a-f7e5-41cb-ad0d-6791a418e570', 'page', 3, 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 91320),
  ('book_dash', '9c9e663c-fe46-11e5-86aa-5e5517507c66', '07afc05a-f7e5-41cb-ad0d-6791a418e570', 'page', 4, 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 60430),
  ('book_dash', '9c9e663c-fe46-11e5-86aa-5e5517507c66', '07afc05a-f7e5-41cb-ad0d-6791a418e570', 'page', 5, 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 72530),
  ('book_dash', '9c9e663c-fe46-11e5-86aa-5e5517507c66', '07afc05a-f7e5-41cb-ad0d-6791a418e570', 'page', 6, 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 65470),
  ('book_dash', '9c9e663c-fe46-11e5-86aa-5e5517507c66', '07afc05a-f7e5-41cb-ad0d-6791a418e570', 'page', 7, 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 71110),
  ('book_dash', '9c9e663c-fe46-11e5-86aa-5e5517507c66', '07afc05a-f7e5-41cb-ad0d-6791a418e570', 'page', 8, 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 80400),
  ('book_dash', '9c9e663c-fe46-11e5-86aa-5e5517507c66', '07afc05a-f7e5-41cb-ad0d-6791a418e570', 'page', 9, 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 78260),
  ('book_dash', '9c9e663c-fe46-11e5-86aa-5e5517507c66', '07afc05a-f7e5-41cb-ad0d-6791a418e570', 'page', 10, 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 38830),
  ('book_dash', '9c9e663c-fe46-11e5-86aa-5e5517507c66', '07afc05a-f7e5-41cb-ad0d-6791a418e570', 'page', 11, 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e663c-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 58010),
  -- book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e6754-fe46-11e5-86aa-5e5517507c66', '04166e9d-c028-4488-aca7-0f94e0f00675', 'cover', 0, 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 9120),
  ('book_dash', '9c9e6754-fe46-11e5-86aa-5e5517507c66', '04166e9d-c028-4488-aca7-0f94e0f00675', 'page', 0, 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 26300),
  ('book_dash', '9c9e6754-fe46-11e5-86aa-5e5517507c66', '04166e9d-c028-4488-aca7-0f94e0f00675', 'page', 1, 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 27770),
  ('book_dash', '9c9e6754-fe46-11e5-86aa-5e5517507c66', '04166e9d-c028-4488-aca7-0f94e0f00675', 'page', 2, 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 25150),
  ('book_dash', '9c9e6754-fe46-11e5-86aa-5e5517507c66', '04166e9d-c028-4488-aca7-0f94e0f00675', 'page', 3, 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 23810),
  ('book_dash', '9c9e6754-fe46-11e5-86aa-5e5517507c66', '04166e9d-c028-4488-aca7-0f94e0f00675', 'page', 4, 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 21860),
  ('book_dash', '9c9e6754-fe46-11e5-86aa-5e5517507c66', '04166e9d-c028-4488-aca7-0f94e0f00675', 'page', 5, 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 27620),
  ('book_dash', '9c9e6754-fe46-11e5-86aa-5e5517507c66', '04166e9d-c028-4488-aca7-0f94e0f00675', 'page', 6, 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 24530),
  ('book_dash', '9c9e6754-fe46-11e5-86aa-5e5517507c66', '04166e9d-c028-4488-aca7-0f94e0f00675', 'page', 7, 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 35810),
  ('book_dash', '9c9e6754-fe46-11e5-86aa-5e5517507c66', '04166e9d-c028-4488-aca7-0f94e0f00675', 'page', 8, 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 25010),
  ('book_dash', '9c9e6754-fe46-11e5-86aa-5e5517507c66', '04166e9d-c028-4488-aca7-0f94e0f00675', 'page', 9, 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 31150),
  ('book_dash', '9c9e6754-fe46-11e5-86aa-5e5517507c66', '04166e9d-c028-4488-aca7-0f94e0f00675', 'page', 10, 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 36100),
  ('book_dash', '9c9e6754-fe46-11e5-86aa-5e5517507c66', '04166e9d-c028-4488-aca7-0f94e0f00675', 'page', 11, 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e6754-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 28100),
  -- book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e6d12-fe46-11e5-86aa-5e5517507c66', 'c2820fc8-380f-46a4-86c5-9cb18f1179a7', 'cover', 0, 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 9260),
  ('book_dash', '9c9e6d12-fe46-11e5-86aa-5e5517507c66', 'c2820fc8-380f-46a4-86c5-9cb18f1179a7', 'page', 0, 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 15360),
  ('book_dash', '9c9e6d12-fe46-11e5-86aa-5e5517507c66', 'c2820fc8-380f-46a4-86c5-9cb18f1179a7', 'page', 1, 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 22610),
  ('book_dash', '9c9e6d12-fe46-11e5-86aa-5e5517507c66', 'c2820fc8-380f-46a4-86c5-9cb18f1179a7', 'page', 2, 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 18240),
  ('book_dash', '9c9e6d12-fe46-11e5-86aa-5e5517507c66', 'c2820fc8-380f-46a4-86c5-9cb18f1179a7', 'page', 3, 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 21720),
  ('book_dash', '9c9e6d12-fe46-11e5-86aa-5e5517507c66', 'c2820fc8-380f-46a4-86c5-9cb18f1179a7', 'page', 4, 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 22630),
  ('book_dash', '9c9e6d12-fe46-11e5-86aa-5e5517507c66', 'c2820fc8-380f-46a4-86c5-9cb18f1179a7', 'page', 5, 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 11660),
  ('book_dash', '9c9e6d12-fe46-11e5-86aa-5e5517507c66', 'c2820fc8-380f-46a4-86c5-9cb18f1179a7', 'page', 6, 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 10850),
  ('book_dash', '9c9e6d12-fe46-11e5-86aa-5e5517507c66', 'c2820fc8-380f-46a4-86c5-9cb18f1179a7', 'page', 7, 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 19580),
  ('book_dash', '9c9e6d12-fe46-11e5-86aa-5e5517507c66', 'c2820fc8-380f-46a4-86c5-9cb18f1179a7', 'page', 8, 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 13510),
  ('book_dash', '9c9e6d12-fe46-11e5-86aa-5e5517507c66', 'c2820fc8-380f-46a4-86c5-9cb18f1179a7', 'page', 9, 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 9380),
  ('book_dash', '9c9e6d12-fe46-11e5-86aa-5e5517507c66', 'c2820fc8-380f-46a4-86c5-9cb18f1179a7', 'page', 10, 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 19800),
  ('book_dash', '9c9e6d12-fe46-11e5-86aa-5e5517507c66', 'c2820fc8-380f-46a4-86c5-9cb18f1179a7', 'page', 11, 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e6d12-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 30190),
  -- book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e6e52-fe46-11e5-86aa-5e5517507c66', '4019adf1-3050-4309-aa9b-b7725fb767fd', 'cover', 0, 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 7920),
  ('book_dash', '9c9e6e52-fe46-11e5-86aa-5e5517507c66', '4019adf1-3050-4309-aa9b-b7725fb767fd', 'page', 0, 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 4870),
  ('book_dash', '9c9e6e52-fe46-11e5-86aa-5e5517507c66', '4019adf1-3050-4309-aa9b-b7725fb767fd', 'page', 1, 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 4560),
  ('book_dash', '9c9e6e52-fe46-11e5-86aa-5e5517507c66', '4019adf1-3050-4309-aa9b-b7725fb767fd', 'page', 2, 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 8330),
  ('book_dash', '9c9e6e52-fe46-11e5-86aa-5e5517507c66', '4019adf1-3050-4309-aa9b-b7725fb767fd', 'page', 3, 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 8280),
  ('book_dash', '9c9e6e52-fe46-11e5-86aa-5e5517507c66', '4019adf1-3050-4309-aa9b-b7725fb767fd', 'page', 4, 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 7150),
  ('book_dash', '9c9e6e52-fe46-11e5-86aa-5e5517507c66', '4019adf1-3050-4309-aa9b-b7725fb767fd', 'page', 5, 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 4130),
  ('book_dash', '9c9e6e52-fe46-11e5-86aa-5e5517507c66', '4019adf1-3050-4309-aa9b-b7725fb767fd', 'page', 6, 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 9260),
  ('book_dash', '9c9e6e52-fe46-11e5-86aa-5e5517507c66', '4019adf1-3050-4309-aa9b-b7725fb767fd', 'page', 7, 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 8450),
  ('book_dash', '9c9e6e52-fe46-11e5-86aa-5e5517507c66', '4019adf1-3050-4309-aa9b-b7725fb767fd', 'page', 8, 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 7610),
  ('book_dash', '9c9e6e52-fe46-11e5-86aa-5e5517507c66', '4019adf1-3050-4309-aa9b-b7725fb767fd', 'page', 9, 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 5500),
  ('book_dash', '9c9e6e52-fe46-11e5-86aa-5e5517507c66', '4019adf1-3050-4309-aa9b-b7725fb767fd', 'page', 10, 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 8300),
  ('book_dash', '9c9e6e52-fe46-11e5-86aa-5e5517507c66', '4019adf1-3050-4309-aa9b-b7725fb767fd', 'page', 11, 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e6e52-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 5860),
  -- book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e6f9c-fe46-11e5-86aa-5e5517507c66', 'f5f9e055-ce9a-4eb9-bcbe-056ddc7deed5', 'cover', 0, 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 9140),
  ('book_dash', '9c9e6f9c-fe46-11e5-86aa-5e5517507c66', 'f5f9e055-ce9a-4eb9-bcbe-056ddc7deed5', 'page', 0, 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 19900),
  ('book_dash', '9c9e6f9c-fe46-11e5-86aa-5e5517507c66', 'f5f9e055-ce9a-4eb9-bcbe-056ddc7deed5', 'page', 1, 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 16030),
  ('book_dash', '9c9e6f9c-fe46-11e5-86aa-5e5517507c66', 'f5f9e055-ce9a-4eb9-bcbe-056ddc7deed5', 'page', 2, 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 13250),
  ('book_dash', '9c9e6f9c-fe46-11e5-86aa-5e5517507c66', 'f5f9e055-ce9a-4eb9-bcbe-056ddc7deed5', 'page', 3, 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 22100),
  ('book_dash', '9c9e6f9c-fe46-11e5-86aa-5e5517507c66', 'f5f9e055-ce9a-4eb9-bcbe-056ddc7deed5', 'page', 4, 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 8880),
  ('book_dash', '9c9e6f9c-fe46-11e5-86aa-5e5517507c66', 'f5f9e055-ce9a-4eb9-bcbe-056ddc7deed5', 'page', 5, 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 21360),
  ('book_dash', '9c9e6f9c-fe46-11e5-86aa-5e5517507c66', 'f5f9e055-ce9a-4eb9-bcbe-056ddc7deed5', 'page', 6, 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 13100),
  ('book_dash', '9c9e6f9c-fe46-11e5-86aa-5e5517507c66', 'f5f9e055-ce9a-4eb9-bcbe-056ddc7deed5', 'page', 7, 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 21070),
  ('book_dash', '9c9e6f9c-fe46-11e5-86aa-5e5517507c66', 'f5f9e055-ce9a-4eb9-bcbe-056ddc7deed5', 'page', 8, 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 26500),
  ('book_dash', '9c9e6f9c-fe46-11e5-86aa-5e5517507c66', 'f5f9e055-ce9a-4eb9-bcbe-056ddc7deed5', 'page', 9, 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 10150),
  ('book_dash', '9c9e6f9c-fe46-11e5-86aa-5e5517507c66', 'f5f9e055-ce9a-4eb9-bcbe-056ddc7deed5', 'page', 10, 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 12100),
  ('book_dash', '9c9e6f9c-fe46-11e5-86aa-5e5517507c66', 'f5f9e055-ce9a-4eb9-bcbe-056ddc7deed5', 'page', 11, 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e6f9c-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 3620),
  -- book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e71cc-fe46-11e5-86aa-5e5517507c66', '8f33b276-ffd9-4334-8d1c-8fd462998e4a', 'cover', 0, 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 9260),
  ('book_dash', '9c9e71cc-fe46-11e5-86aa-5e5517507c66', '8f33b276-ffd9-4334-8d1c-8fd462998e4a', 'page', 0, 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 24140),
  ('book_dash', '9c9e71cc-fe46-11e5-86aa-5e5517507c66', '8f33b276-ffd9-4334-8d1c-8fd462998e4a', 'page', 1, 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 24700),
  ('book_dash', '9c9e71cc-fe46-11e5-86aa-5e5517507c66', '8f33b276-ffd9-4334-8d1c-8fd462998e4a', 'page', 2, 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 23260),
  ('book_dash', '9c9e71cc-fe46-11e5-86aa-5e5517507c66', '8f33b276-ffd9-4334-8d1c-8fd462998e4a', 'page', 3, 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 27910),
  ('book_dash', '9c9e71cc-fe46-11e5-86aa-5e5517507c66', '8f33b276-ffd9-4334-8d1c-8fd462998e4a', 'page', 4, 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 30120),
  ('book_dash', '9c9e71cc-fe46-11e5-86aa-5e5517507c66', '8f33b276-ffd9-4334-8d1c-8fd462998e4a', 'page', 5, 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 22320),
  ('book_dash', '9c9e71cc-fe46-11e5-86aa-5e5517507c66', '8f33b276-ffd9-4334-8d1c-8fd462998e4a', 'page', 6, 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 5740),
  ('book_dash', '9c9e71cc-fe46-11e5-86aa-5e5517507c66', '8f33b276-ffd9-4334-8d1c-8fd462998e4a', 'page', 7, 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 9980),
  ('book_dash', '9c9e71cc-fe46-11e5-86aa-5e5517507c66', '8f33b276-ffd9-4334-8d1c-8fd462998e4a', 'page', 8, 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 31610),
  ('book_dash', '9c9e71cc-fe46-11e5-86aa-5e5517507c66', '8f33b276-ffd9-4334-8d1c-8fd462998e4a', 'page', 9, 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 18960),
  ('book_dash', '9c9e71cc-fe46-11e5-86aa-5e5517507c66', '8f33b276-ffd9-4334-8d1c-8fd462998e4a', 'page', 10, 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 20830),
  ('book_dash', '9c9e71cc-fe46-11e5-86aa-5e5517507c66', '8f33b276-ffd9-4334-8d1c-8fd462998e4a', 'page', 11, 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e71cc-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 5330),
  -- book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66  (page 11 + cover 1)
  ('book_dash', '9c9e72e4-fe46-11e5-86aa-5e5517507c66', '52d93876-df1b-4e27-b0e9-02c24a8ed4ea', 'cover', 0, 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 8330),
  ('book_dash', '9c9e72e4-fe46-11e5-86aa-5e5517507c66', '52d93876-df1b-4e27-b0e9-02c24a8ed4ea', 'page', 0, 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 3260),
  ('book_dash', '9c9e72e4-fe46-11e5-86aa-5e5517507c66', '52d93876-df1b-4e27-b0e9-02c24a8ed4ea', 'page', 1, 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 2740),
  ('book_dash', '9c9e72e4-fe46-11e5-86aa-5e5517507c66', '52d93876-df1b-4e27-b0e9-02c24a8ed4ea', 'page', 2, 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 6600),
  ('book_dash', '9c9e72e4-fe46-11e5-86aa-5e5517507c66', '52d93876-df1b-4e27-b0e9-02c24a8ed4ea', 'page', 3, 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 4900),
  ('book_dash', '9c9e72e4-fe46-11e5-86aa-5e5517507c66', '52d93876-df1b-4e27-b0e9-02c24a8ed4ea', 'page', 4, 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 6600),
  ('book_dash', '9c9e72e4-fe46-11e5-86aa-5e5517507c66', '52d93876-df1b-4e27-b0e9-02c24a8ed4ea', 'page', 5, 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 5230),
  ('book_dash', '9c9e72e4-fe46-11e5-86aa-5e5517507c66', '52d93876-df1b-4e27-b0e9-02c24a8ed4ea', 'page', 6, 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 6820),
  ('book_dash', '9c9e72e4-fe46-11e5-86aa-5e5517507c66', '52d93876-df1b-4e27-b0e9-02c24a8ed4ea', 'page', 7, 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 4730),
  ('book_dash', '9c9e72e4-fe46-11e5-86aa-5e5517507c66', '52d93876-df1b-4e27-b0e9-02c24a8ed4ea', 'page', 8, 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 3790),
  ('book_dash', '9c9e72e4-fe46-11e5-86aa-5e5517507c66', '52d93876-df1b-4e27-b0e9-02c24a8ed4ea', 'page', 10, 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 3430),
  ('book_dash', '9c9e72e4-fe46-11e5-86aa-5e5517507c66', '52d93876-df1b-4e27-b0e9-02c24a8ed4ea', 'page', 11, 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e72e4-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 4800),
  -- book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e76ea-fe46-11e5-86aa-5e5517507c66', '357bf174-064b-4f3c-abfd-e06e6e42d69c', 'cover', 0, 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 12050),
  ('book_dash', '9c9e76ea-fe46-11e5-86aa-5e5517507c66', '357bf174-064b-4f3c-abfd-e06e6e42d69c', 'page', 0, 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 18140),
  ('book_dash', '9c9e76ea-fe46-11e5-86aa-5e5517507c66', '357bf174-064b-4f3c-abfd-e06e6e42d69c', 'page', 1, 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 21170),
  ('book_dash', '9c9e76ea-fe46-11e5-86aa-5e5517507c66', '357bf174-064b-4f3c-abfd-e06e6e42d69c', 'page', 2, 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 24910),
  ('book_dash', '9c9e76ea-fe46-11e5-86aa-5e5517507c66', '357bf174-064b-4f3c-abfd-e06e6e42d69c', 'page', 3, 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 15120),
  ('book_dash', '9c9e76ea-fe46-11e5-86aa-5e5517507c66', '357bf174-064b-4f3c-abfd-e06e6e42d69c', 'page', 4, 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 18140),
  ('book_dash', '9c9e76ea-fe46-11e5-86aa-5e5517507c66', '357bf174-064b-4f3c-abfd-e06e6e42d69c', 'page', 5, 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 42310),
  ('book_dash', '9c9e76ea-fe46-11e5-86aa-5e5517507c66', '357bf174-064b-4f3c-abfd-e06e6e42d69c', 'page', 6, 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 20210),
  ('book_dash', '9c9e76ea-fe46-11e5-86aa-5e5517507c66', '357bf174-064b-4f3c-abfd-e06e6e42d69c', 'page', 7, 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 24940),
  ('book_dash', '9c9e76ea-fe46-11e5-86aa-5e5517507c66', '357bf174-064b-4f3c-abfd-e06e6e42d69c', 'page', 8, 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 23980),
  ('book_dash', '9c9e76ea-fe46-11e5-86aa-5e5517507c66', '357bf174-064b-4f3c-abfd-e06e6e42d69c', 'page', 9, 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 39480),
  ('book_dash', '9c9e76ea-fe46-11e5-86aa-5e5517507c66', '357bf174-064b-4f3c-abfd-e06e6e42d69c', 'page', 10, 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 31200),
  ('book_dash', '9c9e76ea-fe46-11e5-86aa-5e5517507c66', '357bf174-064b-4f3c-abfd-e06e6e42d69c', 'page', 11, 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e76ea-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 36460),
  -- book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e7820-fe46-11e5-86aa-5e5517507c66', 'f35dd8ae-2408-46c0-8794-f7e931abddab', 'cover', 0, 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 8780),
  ('book_dash', '9c9e7820-fe46-11e5-86aa-5e5517507c66', 'f35dd8ae-2408-46c0-8794-f7e931abddab', 'page', 0, 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 3170),
  ('book_dash', '9c9e7820-fe46-11e5-86aa-5e5517507c66', 'f35dd8ae-2408-46c0-8794-f7e931abddab', 'page', 1, 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 3910),
  ('book_dash', '9c9e7820-fe46-11e5-86aa-5e5517507c66', 'f35dd8ae-2408-46c0-8794-f7e931abddab', 'page', 2, 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 3890),
  ('book_dash', '9c9e7820-fe46-11e5-86aa-5e5517507c66', 'f35dd8ae-2408-46c0-8794-f7e931abddab', 'page', 3, 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 3720),
  ('book_dash', '9c9e7820-fe46-11e5-86aa-5e5517507c66', 'f35dd8ae-2408-46c0-8794-f7e931abddab', 'page', 4, 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 4390),
  ('book_dash', '9c9e7820-fe46-11e5-86aa-5e5517507c66', 'f35dd8ae-2408-46c0-8794-f7e931abddab', 'page', 5, 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 3650),
  ('book_dash', '9c9e7820-fe46-11e5-86aa-5e5517507c66', 'f35dd8ae-2408-46c0-8794-f7e931abddab', 'page', 6, 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 3860),
  ('book_dash', '9c9e7820-fe46-11e5-86aa-5e5517507c66', 'f35dd8ae-2408-46c0-8794-f7e931abddab', 'page', 7, 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 4100),
  ('book_dash', '9c9e7820-fe46-11e5-86aa-5e5517507c66', 'f35dd8ae-2408-46c0-8794-f7e931abddab', 'page', 8, 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 3480),
  ('book_dash', '9c9e7820-fe46-11e5-86aa-5e5517507c66', 'f35dd8ae-2408-46c0-8794-f7e931abddab', 'page', 9, 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 3790),
  ('book_dash', '9c9e7820-fe46-11e5-86aa-5e5517507c66', 'f35dd8ae-2408-46c0-8794-f7e931abddab', 'page', 10, 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 790),
  ('book_dash', '9c9e7820-fe46-11e5-86aa-5e5517507c66', 'f35dd8ae-2408-46c0-8794-f7e931abddab', 'page', 11, 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e7820-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 5620),
  -- book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e7a6e-fe46-11e5-86aa-5e5517507c66', '19074fad-f66a-49b2-9762-7ec152bef19d', 'cover', 0, 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 8400),
  ('book_dash', '9c9e7a6e-fe46-11e5-86aa-5e5517507c66', '19074fad-f66a-49b2-9762-7ec152bef19d', 'page', 0, 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 10420),
  ('book_dash', '9c9e7a6e-fe46-11e5-86aa-5e5517507c66', '19074fad-f66a-49b2-9762-7ec152bef19d', 'page', 1, 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 12070),
  ('book_dash', '9c9e7a6e-fe46-11e5-86aa-5e5517507c66', '19074fad-f66a-49b2-9762-7ec152bef19d', 'page', 2, 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 16390),
  ('book_dash', '9c9e7a6e-fe46-11e5-86aa-5e5517507c66', '19074fad-f66a-49b2-9762-7ec152bef19d', 'page', 3, 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 16750),
  ('book_dash', '9c9e7a6e-fe46-11e5-86aa-5e5517507c66', '19074fad-f66a-49b2-9762-7ec152bef19d', 'page', 4, 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 18620),
  ('book_dash', '9c9e7a6e-fe46-11e5-86aa-5e5517507c66', '19074fad-f66a-49b2-9762-7ec152bef19d', 'page', 5, 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 18310),
  ('book_dash', '9c9e7a6e-fe46-11e5-86aa-5e5517507c66', '19074fad-f66a-49b2-9762-7ec152bef19d', 'page', 6, 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 14470),
  ('book_dash', '9c9e7a6e-fe46-11e5-86aa-5e5517507c66', '19074fad-f66a-49b2-9762-7ec152bef19d', 'page', 7, 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 18620),
  ('book_dash', '9c9e7a6e-fe46-11e5-86aa-5e5517507c66', '19074fad-f66a-49b2-9762-7ec152bef19d', 'page', 8, 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 19130),
  ('book_dash', '9c9e7a6e-fe46-11e5-86aa-5e5517507c66', '19074fad-f66a-49b2-9762-7ec152bef19d', 'page', 9, 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 16850),
  ('book_dash', '9c9e7a6e-fe46-11e5-86aa-5e5517507c66', '19074fad-f66a-49b2-9762-7ec152bef19d', 'page', 10, 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 15700),
  ('book_dash', '9c9e7a6e-fe46-11e5-86aa-5e5517507c66', '19074fad-f66a-49b2-9762-7ec152bef19d', 'page', 11, 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e7a6e-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 7990),
  -- book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e7b9a-fe46-11e5-86aa-5e5517507c66', 'c9885925-bd2c-41b1-8fd2-5ae7c7b3dd23', 'cover', 0, 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 8860),
  ('book_dash', '9c9e7b9a-fe46-11e5-86aa-5e5517507c66', 'c9885925-bd2c-41b1-8fd2-5ae7c7b3dd23', 'page', 0, 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 7900),
  ('book_dash', '9c9e7b9a-fe46-11e5-86aa-5e5517507c66', 'c9885925-bd2c-41b1-8fd2-5ae7c7b3dd23', 'page', 1, 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 10490),
  ('book_dash', '9c9e7b9a-fe46-11e5-86aa-5e5517507c66', 'c9885925-bd2c-41b1-8fd2-5ae7c7b3dd23', 'page', 2, 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 14090),
  ('book_dash', '9c9e7b9a-fe46-11e5-86aa-5e5517507c66', 'c9885925-bd2c-41b1-8fd2-5ae7c7b3dd23', 'page', 3, 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 15070),
  ('book_dash', '9c9e7b9a-fe46-11e5-86aa-5e5517507c66', 'c9885925-bd2c-41b1-8fd2-5ae7c7b3dd23', 'page', 4, 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 18670),
  ('book_dash', '9c9e7b9a-fe46-11e5-86aa-5e5517507c66', 'c9885925-bd2c-41b1-8fd2-5ae7c7b3dd23', 'page', 5, 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 10800),
  ('book_dash', '9c9e7b9a-fe46-11e5-86aa-5e5517507c66', 'c9885925-bd2c-41b1-8fd2-5ae7c7b3dd23', 'page', 6, 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 17040),
  ('book_dash', '9c9e7b9a-fe46-11e5-86aa-5e5517507c66', 'c9885925-bd2c-41b1-8fd2-5ae7c7b3dd23', 'page', 7, 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 17040),
  ('book_dash', '9c9e7b9a-fe46-11e5-86aa-5e5517507c66', 'c9885925-bd2c-41b1-8fd2-5ae7c7b3dd23', 'page', 8, 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 9260),
  ('book_dash', '9c9e7b9a-fe46-11e5-86aa-5e5517507c66', 'c9885925-bd2c-41b1-8fd2-5ae7c7b3dd23', 'page', 9, 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 19630),
  ('book_dash', '9c9e7b9a-fe46-11e5-86aa-5e5517507c66', 'c9885925-bd2c-41b1-8fd2-5ae7c7b3dd23', 'page', 10, 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 13700),
  ('book_dash', '9c9e7b9a-fe46-11e5-86aa-5e5517507c66', 'c9885925-bd2c-41b1-8fd2-5ae7c7b3dd23', 'page', 11, 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e7b9a-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 8230),
  -- book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e7cb2-fe46-11e5-86aa-5e5517507c66', '67deeed1-8f5e-4b3e-90cc-c67bda9ecdc9', 'cover', 0, 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 8039),
  ('book_dash', '9c9e7cb2-fe46-11e5-86aa-5e5517507c66', '67deeed1-8f5e-4b3e-90cc-c67bda9ecdc9', 'page', 0, 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 9740),
  ('book_dash', '9c9e7cb2-fe46-11e5-86aa-5e5517507c66', '67deeed1-8f5e-4b3e-90cc-c67bda9ecdc9', 'page', 1, 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 8570),
  ('book_dash', '9c9e7cb2-fe46-11e5-86aa-5e5517507c66', '67deeed1-8f5e-4b3e-90cc-c67bda9ecdc9', 'page', 2, 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 8980),
  ('book_dash', '9c9e7cb2-fe46-11e5-86aa-5e5517507c66', '67deeed1-8f5e-4b3e-90cc-c67bda9ecdc9', 'page', 3, 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 8620),
  ('book_dash', '9c9e7cb2-fe46-11e5-86aa-5e5517507c66', '67deeed1-8f5e-4b3e-90cc-c67bda9ecdc9', 'page', 4, 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 8980),
  ('book_dash', '9c9e7cb2-fe46-11e5-86aa-5e5517507c66', '67deeed1-8f5e-4b3e-90cc-c67bda9ecdc9', 'page', 5, 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 8930),
  ('book_dash', '9c9e7cb2-fe46-11e5-86aa-5e5517507c66', '67deeed1-8f5e-4b3e-90cc-c67bda9ecdc9', 'page', 6, 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 8980),
  ('book_dash', '9c9e7cb2-fe46-11e5-86aa-5e5517507c66', '67deeed1-8f5e-4b3e-90cc-c67bda9ecdc9', 'page', 7, 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 11040),
  ('book_dash', '9c9e7cb2-fe46-11e5-86aa-5e5517507c66', '67deeed1-8f5e-4b3e-90cc-c67bda9ecdc9', 'page', 8, 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 8980),
  ('book_dash', '9c9e7cb2-fe46-11e5-86aa-5e5517507c66', '67deeed1-8f5e-4b3e-90cc-c67bda9ecdc9', 'page', 9, 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 8230),
  ('book_dash', '9c9e7cb2-fe46-11e5-86aa-5e5517507c66', '67deeed1-8f5e-4b3e-90cc-c67bda9ecdc9', 'page', 10, 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 9290),
  ('book_dash', '9c9e7cb2-fe46-11e5-86aa-5e5517507c66', '67deeed1-8f5e-4b3e-90cc-c67bda9ecdc9', 'page', 11, 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e7cb2-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 7730),
  -- book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e7dca-fe46-11e5-86aa-5e5517507c66', '0c1d19fe-f40c-4b5f-8bfb-65d5526e4a0c', 'cover', 0, 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 9070),
  ('book_dash', '9c9e7dca-fe46-11e5-86aa-5e5517507c66', '0c1d19fe-f40c-4b5f-8bfb-65d5526e4a0c', 'page', 0, 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 23500),
  ('book_dash', '9c9e7dca-fe46-11e5-86aa-5e5517507c66', '0c1d19fe-f40c-4b5f-8bfb-65d5526e4a0c', 'page', 1, 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 21700),
  ('book_dash', '9c9e7dca-fe46-11e5-86aa-5e5517507c66', '0c1d19fe-f40c-4b5f-8bfb-65d5526e4a0c', 'page', 2, 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 21840),
  ('book_dash', '9c9e7dca-fe46-11e5-86aa-5e5517507c66', '0c1d19fe-f40c-4b5f-8bfb-65d5526e4a0c', 'page', 3, 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 21340),
  ('book_dash', '9c9e7dca-fe46-11e5-86aa-5e5517507c66', '0c1d19fe-f40c-4b5f-8bfb-65d5526e4a0c', 'page', 4, 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 26350),
  ('book_dash', '9c9e7dca-fe46-11e5-86aa-5e5517507c66', '0c1d19fe-f40c-4b5f-8bfb-65d5526e4a0c', 'page', 5, 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 28900),
  ('book_dash', '9c9e7dca-fe46-11e5-86aa-5e5517507c66', '0c1d19fe-f40c-4b5f-8bfb-65d5526e4a0c', 'page', 6, 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 29540),
  ('book_dash', '9c9e7dca-fe46-11e5-86aa-5e5517507c66', '0c1d19fe-f40c-4b5f-8bfb-65d5526e4a0c', 'page', 7, 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 27580),
  ('book_dash', '9c9e7dca-fe46-11e5-86aa-5e5517507c66', '0c1d19fe-f40c-4b5f-8bfb-65d5526e4a0c', 'page', 8, 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 30050),
  ('book_dash', '9c9e7dca-fe46-11e5-86aa-5e5517507c66', '0c1d19fe-f40c-4b5f-8bfb-65d5526e4a0c', 'page', 9, 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 6430),
  ('book_dash', '9c9e7dca-fe46-11e5-86aa-5e5517507c66', '0c1d19fe-f40c-4b5f-8bfb-65d5526e4a0c', 'page', 10, 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 14590),
  ('book_dash', '9c9e7dca-fe46-11e5-86aa-5e5517507c66', '0c1d19fe-f40c-4b5f-8bfb-65d5526e4a0c', 'page', 11, 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e7dca-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 15670),
  -- book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e819e-fe46-11e5-86aa-5e5517507c66', '27c84efc-f68a-4a76-bef1-17acfbcc5a19', 'cover', 0, 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 9000),
  ('book_dash', '9c9e819e-fe46-11e5-86aa-5e5517507c66', '27c84efc-f68a-4a76-bef1-17acfbcc5a19', 'page', 0, 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 2040),
  ('book_dash', '9c9e819e-fe46-11e5-86aa-5e5517507c66', '27c84efc-f68a-4a76-bef1-17acfbcc5a19', 'page', 1, 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 4100),
  ('book_dash', '9c9e819e-fe46-11e5-86aa-5e5517507c66', '27c84efc-f68a-4a76-bef1-17acfbcc5a19', 'page', 2, 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 5810),
  ('book_dash', '9c9e819e-fe46-11e5-86aa-5e5517507c66', '27c84efc-f68a-4a76-bef1-17acfbcc5a19', 'page', 3, 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 7750),
  ('book_dash', '9c9e819e-fe46-11e5-86aa-5e5517507c66', '27c84efc-f68a-4a76-bef1-17acfbcc5a19', 'page', 4, 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 1940),
  ('book_dash', '9c9e819e-fe46-11e5-86aa-5e5517507c66', '27c84efc-f68a-4a76-bef1-17acfbcc5a19', 'page', 5, 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 2950),
  ('book_dash', '9c9e819e-fe46-11e5-86aa-5e5517507c66', '27c84efc-f68a-4a76-bef1-17acfbcc5a19', 'page', 6, 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 5060),
  ('book_dash', '9c9e819e-fe46-11e5-86aa-5e5517507c66', '27c84efc-f68a-4a76-bef1-17acfbcc5a19', 'page', 7, 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 3480),
  ('book_dash', '9c9e819e-fe46-11e5-86aa-5e5517507c66', '27c84efc-f68a-4a76-bef1-17acfbcc5a19', 'page', 8, 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 1630),
  ('book_dash', '9c9e819e-fe46-11e5-86aa-5e5517507c66', '27c84efc-f68a-4a76-bef1-17acfbcc5a19', 'page', 9, 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 3340),
  ('book_dash', '9c9e819e-fe46-11e5-86aa-5e5517507c66', '27c84efc-f68a-4a76-bef1-17acfbcc5a19', 'page', 10, 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 4440),
  ('book_dash', '9c9e819e-fe46-11e5-86aa-5e5517507c66', '27c84efc-f68a-4a76-bef1-17acfbcc5a19', 'page', 11, 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e819e-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 3890),
  -- book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e83b0-fe46-11e5-86aa-5e5517507c66', 'b00a5b46-7616-4373-a9a7-58c1b176c386', 'cover', 0, 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 7850),
  ('book_dash', '9c9e83b0-fe46-11e5-86aa-5e5517507c66', 'b00a5b46-7616-4373-a9a7-58c1b176c386', 'page', 0, 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 7010),
  ('book_dash', '9c9e83b0-fe46-11e5-86aa-5e5517507c66', 'b00a5b46-7616-4373-a9a7-58c1b176c386', 'page', 1, 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 5740),
  ('book_dash', '9c9e83b0-fe46-11e5-86aa-5e5517507c66', 'b00a5b46-7616-4373-a9a7-58c1b176c386', 'page', 2, 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 5640),
  ('book_dash', '9c9e83b0-fe46-11e5-86aa-5e5517507c66', 'b00a5b46-7616-4373-a9a7-58c1b176c386', 'page', 3, 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 7300),
  ('book_dash', '9c9e83b0-fe46-11e5-86aa-5e5517507c66', 'b00a5b46-7616-4373-a9a7-58c1b176c386', 'page', 4, 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 15910),
  ('book_dash', '9c9e83b0-fe46-11e5-86aa-5e5517507c66', 'b00a5b46-7616-4373-a9a7-58c1b176c386', 'page', 5, 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 8160),
  ('book_dash', '9c9e83b0-fe46-11e5-86aa-5e5517507c66', 'b00a5b46-7616-4373-a9a7-58c1b176c386', 'page', 6, 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 8780),
  ('book_dash', '9c9e83b0-fe46-11e5-86aa-5e5517507c66', 'b00a5b46-7616-4373-a9a7-58c1b176c386', 'page', 7, 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 7630),
  ('book_dash', '9c9e83b0-fe46-11e5-86aa-5e5517507c66', 'b00a5b46-7616-4373-a9a7-58c1b176c386', 'page', 8, 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 7420),
  ('book_dash', '9c9e83b0-fe46-11e5-86aa-5e5517507c66', 'b00a5b46-7616-4373-a9a7-58c1b176c386', 'page', 9, 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 7700),
  ('book_dash', '9c9e83b0-fe46-11e5-86aa-5e5517507c66', 'b00a5b46-7616-4373-a9a7-58c1b176c386', 'page', 10, 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 10390),
  ('book_dash', '9c9e83b0-fe46-11e5-86aa-5e5517507c66', 'b00a5b46-7616-4373-a9a7-58c1b176c386', 'page', 11, 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e83b0-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 8570),
  -- book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e8586-fe46-11e5-86aa-5e5517507c66', '74b531b1-4aa3-4b91-ae1e-00dd95e7e910', 'cover', 0, 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 9170),
  ('book_dash', '9c9e8586-fe46-11e5-86aa-5e5517507c66', '74b531b1-4aa3-4b91-ae1e-00dd95e7e910', 'page', 0, 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 15410),
  ('book_dash', '9c9e8586-fe46-11e5-86aa-5e5517507c66', '74b531b1-4aa3-4b91-ae1e-00dd95e7e910', 'page', 1, 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 16370),
  ('book_dash', '9c9e8586-fe46-11e5-86aa-5e5517507c66', '74b531b1-4aa3-4b91-ae1e-00dd95e7e910', 'page', 2, 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 17380),
  ('book_dash', '9c9e8586-fe46-11e5-86aa-5e5517507c66', '74b531b1-4aa3-4b91-ae1e-00dd95e7e910', 'page', 3, 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 18310),
  ('book_dash', '9c9e8586-fe46-11e5-86aa-5e5517507c66', '74b531b1-4aa3-4b91-ae1e-00dd95e7e910', 'page', 4, 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 15500),
  ('book_dash', '9c9e8586-fe46-11e5-86aa-5e5517507c66', '74b531b1-4aa3-4b91-ae1e-00dd95e7e910', 'page', 5, 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 17740),
  ('book_dash', '9c9e8586-fe46-11e5-86aa-5e5517507c66', '74b531b1-4aa3-4b91-ae1e-00dd95e7e910', 'page', 6, 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 19150),
  ('book_dash', '9c9e8586-fe46-11e5-86aa-5e5517507c66', '74b531b1-4aa3-4b91-ae1e-00dd95e7e910', 'page', 7, 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 16940),
  ('book_dash', '9c9e8586-fe46-11e5-86aa-5e5517507c66', '74b531b1-4aa3-4b91-ae1e-00dd95e7e910', 'page', 8, 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 19750),
  ('book_dash', '9c9e8586-fe46-11e5-86aa-5e5517507c66', '74b531b1-4aa3-4b91-ae1e-00dd95e7e910', 'page', 9, 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 17330),
  ('book_dash', '9c9e8586-fe46-11e5-86aa-5e5517507c66', '74b531b1-4aa3-4b91-ae1e-00dd95e7e910', 'page', 10, 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 16610),
  ('book_dash', '9c9e8586-fe46-11e5-86aa-5e5517507c66', '74b531b1-4aa3-4b91-ae1e-00dd95e7e910', 'page', 11, 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e8586-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 15650),
  -- book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e86da-fe46-11e5-86aa-5e5517507c66', 'e50bd660-92c8-4938-b342-b43409bdb99f', 'cover', 0, 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 10100),
  ('book_dash', '9c9e86da-fe46-11e5-86aa-5e5517507c66', 'e50bd660-92c8-4938-b342-b43409bdb99f', 'page', 0, 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 11400),
  ('book_dash', '9c9e86da-fe46-11e5-86aa-5e5517507c66', 'e50bd660-92c8-4938-b342-b43409bdb99f', 'page', 1, 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 5260),
  ('book_dash', '9c9e86da-fe46-11e5-86aa-5e5517507c66', 'e50bd660-92c8-4938-b342-b43409bdb99f', 'page', 2, 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 3840),
  ('book_dash', '9c9e86da-fe46-11e5-86aa-5e5517507c66', 'e50bd660-92c8-4938-b342-b43409bdb99f', 'page', 3, 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 7420),
  ('book_dash', '9c9e86da-fe46-11e5-86aa-5e5517507c66', 'e50bd660-92c8-4938-b342-b43409bdb99f', 'page', 4, 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 840),
  ('book_dash', '9c9e86da-fe46-11e5-86aa-5e5517507c66', 'e50bd660-92c8-4938-b342-b43409bdb99f', 'page', 5, 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 4850),
  ('book_dash', '9c9e86da-fe46-11e5-86aa-5e5517507c66', 'e50bd660-92c8-4938-b342-b43409bdb99f', 'page', 6, 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 1200),
  ('book_dash', '9c9e86da-fe46-11e5-86aa-5e5517507c66', 'e50bd660-92c8-4938-b342-b43409bdb99f', 'page', 7, 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 5620),
  ('book_dash', '9c9e86da-fe46-11e5-86aa-5e5517507c66', 'e50bd660-92c8-4938-b342-b43409bdb99f', 'page', 8, 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 4390),
  ('book_dash', '9c9e86da-fe46-11e5-86aa-5e5517507c66', 'e50bd660-92c8-4938-b342-b43409bdb99f', 'page', 9, 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 910),
  ('book_dash', '9c9e86da-fe46-11e5-86aa-5e5517507c66', 'e50bd660-92c8-4938-b342-b43409bdb99f', 'page', 10, 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 4920),
  ('book_dash', '9c9e86da-fe46-11e5-86aa-5e5517507c66', 'e50bd660-92c8-4938-b342-b43409bdb99f', 'page', 11, 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e86da-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 5230),
  -- book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e87f2-fe46-11e5-86aa-5e5517507c66', 'bf1cb69a-e1bf-4682-bdbf-c26422073983', 'cover', 0, 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 9140),
  ('book_dash', '9c9e87f2-fe46-11e5-86aa-5e5517507c66', 'bf1cb69a-e1bf-4682-bdbf-c26422073983', 'page', 0, 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 25610),
  ('book_dash', '9c9e87f2-fe46-11e5-86aa-5e5517507c66', 'bf1cb69a-e1bf-4682-bdbf-c26422073983', 'page', 1, 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 15120),
  ('book_dash', '9c9e87f2-fe46-11e5-86aa-5e5517507c66', 'bf1cb69a-e1bf-4682-bdbf-c26422073983', 'page', 2, 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 30530),
  ('book_dash', '9c9e87f2-fe46-11e5-86aa-5e5517507c66', 'bf1cb69a-e1bf-4682-bdbf-c26422073983', 'page', 3, 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 27650),
  ('book_dash', '9c9e87f2-fe46-11e5-86aa-5e5517507c66', 'bf1cb69a-e1bf-4682-bdbf-c26422073983', 'page', 4, 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 30790),
  ('book_dash', '9c9e87f2-fe46-11e5-86aa-5e5517507c66', 'bf1cb69a-e1bf-4682-bdbf-c26422073983', 'page', 5, 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 26330),
  ('book_dash', '9c9e87f2-fe46-11e5-86aa-5e5517507c66', 'bf1cb69a-e1bf-4682-bdbf-c26422073983', 'page', 6, 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 41690),
  ('book_dash', '9c9e87f2-fe46-11e5-86aa-5e5517507c66', 'bf1cb69a-e1bf-4682-bdbf-c26422073983', 'page', 7, 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 44760),
  ('book_dash', '9c9e87f2-fe46-11e5-86aa-5e5517507c66', 'bf1cb69a-e1bf-4682-bdbf-c26422073983', 'page', 8, 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 28870),
  ('book_dash', '9c9e87f2-fe46-11e5-86aa-5e5517507c66', 'bf1cb69a-e1bf-4682-bdbf-c26422073983', 'page', 9, 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 16800),
  ('book_dash', '9c9e87f2-fe46-11e5-86aa-5e5517507c66', 'bf1cb69a-e1bf-4682-bdbf-c26422073983', 'page', 10, 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 12460),
  ('book_dash', '9c9e87f2-fe46-11e5-86aa-5e5517507c66', 'bf1cb69a-e1bf-4682-bdbf-c26422073983', 'page', 11, 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e87f2-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 41020),
  -- book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e8c0c-fe46-11e5-86aa-5e5517507c66', '83029b02-3c43-4984-9b1a-29097fce4cba', 'cover', 0, 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 10510),
  ('book_dash', '9c9e8c0c-fe46-11e5-86aa-5e5517507c66', '83029b02-3c43-4984-9b1a-29097fce4cba', 'page', 0, 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 4390),
  ('book_dash', '9c9e8c0c-fe46-11e5-86aa-5e5517507c66', '83029b02-3c43-4984-9b1a-29097fce4cba', 'page', 1, 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 3860),
  ('book_dash', '9c9e8c0c-fe46-11e5-86aa-5e5517507c66', '83029b02-3c43-4984-9b1a-29097fce4cba', 'page', 2, 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 2780),
  ('book_dash', '9c9e8c0c-fe46-11e5-86aa-5e5517507c66', '83029b02-3c43-4984-9b1a-29097fce4cba', 'page', 3, 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 6140),
  ('book_dash', '9c9e8c0c-fe46-11e5-86aa-5e5517507c66', '83029b02-3c43-4984-9b1a-29097fce4cba', 'page', 4, 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 2950),
  ('book_dash', '9c9e8c0c-fe46-11e5-86aa-5e5517507c66', '83029b02-3c43-4984-9b1a-29097fce4cba', 'page', 5, 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 2470),
  ('book_dash', '9c9e8c0c-fe46-11e5-86aa-5e5517507c66', '83029b02-3c43-4984-9b1a-29097fce4cba', 'page', 6, 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 8710),
  ('book_dash', '9c9e8c0c-fe46-11e5-86aa-5e5517507c66', '83029b02-3c43-4984-9b1a-29097fce4cba', 'page', 7, 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 3260),
  ('book_dash', '9c9e8c0c-fe46-11e5-86aa-5e5517507c66', '83029b02-3c43-4984-9b1a-29097fce4cba', 'page', 8, 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 2760),
  ('book_dash', '9c9e8c0c-fe46-11e5-86aa-5e5517507c66', '83029b02-3c43-4984-9b1a-29097fce4cba', 'page', 9, 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 4560),
  ('book_dash', '9c9e8c0c-fe46-11e5-86aa-5e5517507c66', '83029b02-3c43-4984-9b1a-29097fce4cba', 'page', 10, 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 6170),
  ('book_dash', '9c9e8c0c-fe46-11e5-86aa-5e5517507c66', '83029b02-3c43-4984-9b1a-29097fce4cba', 'page', 11, 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e8c0c-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 5520),
  -- book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e9102-fe46-11e5-86aa-5e5517507c66', '5cacbb62-4e94-43c2-8ad3-26763b885d01', 'cover', 0, 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 8280),
  ('book_dash', '9c9e9102-fe46-11e5-86aa-5e5517507c66', '5cacbb62-4e94-43c2-8ad3-26763b885d01', 'page', 0, 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 6170),
  ('book_dash', '9c9e9102-fe46-11e5-86aa-5e5517507c66', '5cacbb62-4e94-43c2-8ad3-26763b885d01', 'page', 1, 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 6980),
  ('book_dash', '9c9e9102-fe46-11e5-86aa-5e5517507c66', '5cacbb62-4e94-43c2-8ad3-26763b885d01', 'page', 2, 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 7080),
  ('book_dash', '9c9e9102-fe46-11e5-86aa-5e5517507c66', '5cacbb62-4e94-43c2-8ad3-26763b885d01', 'page', 3, 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 7060),
  ('book_dash', '9c9e9102-fe46-11e5-86aa-5e5517507c66', '5cacbb62-4e94-43c2-8ad3-26763b885d01', 'page', 4, 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 8860),
  ('book_dash', '9c9e9102-fe46-11e5-86aa-5e5517507c66', '5cacbb62-4e94-43c2-8ad3-26763b885d01', 'page', 5, 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 8570),
  ('book_dash', '9c9e9102-fe46-11e5-86aa-5e5517507c66', '5cacbb62-4e94-43c2-8ad3-26763b885d01', 'page', 6, 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 6740),
  ('book_dash', '9c9e9102-fe46-11e5-86aa-5e5517507c66', '5cacbb62-4e94-43c2-8ad3-26763b885d01', 'page', 7, 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 9050),
  ('book_dash', '9c9e9102-fe46-11e5-86aa-5e5517507c66', '5cacbb62-4e94-43c2-8ad3-26763b885d01', 'page', 8, 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 9170),
  ('book_dash', '9c9e9102-fe46-11e5-86aa-5e5517507c66', '5cacbb62-4e94-43c2-8ad3-26763b885d01', 'page', 9, 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 9000),
  ('book_dash', '9c9e9102-fe46-11e5-86aa-5e5517507c66', '5cacbb62-4e94-43c2-8ad3-26763b885d01', 'page', 10, 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 8420),
  ('book_dash', '9c9e9102-fe46-11e5-86aa-5e5517507c66', '5cacbb62-4e94-43c2-8ad3-26763b885d01', 'page', 11, 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e9102-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 9720),
  -- book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e9396-fe46-11e5-86aa-5e5517507c66', '0b155b5c-1452-40c2-9e3a-60e56a98e2b8', 'cover', 0, 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 8540),
  ('book_dash', '9c9e9396-fe46-11e5-86aa-5e5517507c66', '0b155b5c-1452-40c2-9e3a-60e56a98e2b8', 'page', 0, 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 5640),
  ('book_dash', '9c9e9396-fe46-11e5-86aa-5e5517507c66', '0b155b5c-1452-40c2-9e3a-60e56a98e2b8', 'page', 1, 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 6190),
  ('book_dash', '9c9e9396-fe46-11e5-86aa-5e5517507c66', '0b155b5c-1452-40c2-9e3a-60e56a98e2b8', 'page', 2, 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 5980),
  ('book_dash', '9c9e9396-fe46-11e5-86aa-5e5517507c66', '0b155b5c-1452-40c2-9e3a-60e56a98e2b8', 'page', 3, 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 3430),
  ('book_dash', '9c9e9396-fe46-11e5-86aa-5e5517507c66', '0b155b5c-1452-40c2-9e3a-60e56a98e2b8', 'page', 4, 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 2420),
  ('book_dash', '9c9e9396-fe46-11e5-86aa-5e5517507c66', '0b155b5c-1452-40c2-9e3a-60e56a98e2b8', 'page', 5, 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 10420),
  ('book_dash', '9c9e9396-fe46-11e5-86aa-5e5517507c66', '0b155b5c-1452-40c2-9e3a-60e56a98e2b8', 'page', 6, 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 2900),
  ('book_dash', '9c9e9396-fe46-11e5-86aa-5e5517507c66', '0b155b5c-1452-40c2-9e3a-60e56a98e2b8', 'page', 7, 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 3360),
  ('book_dash', '9c9e9396-fe46-11e5-86aa-5e5517507c66', '0b155b5c-1452-40c2-9e3a-60e56a98e2b8', 'page', 8, 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 3070),
  ('book_dash', '9c9e9396-fe46-11e5-86aa-5e5517507c66', '0b155b5c-1452-40c2-9e3a-60e56a98e2b8', 'page', 9, 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 7730),
  ('book_dash', '9c9e9396-fe46-11e5-86aa-5e5517507c66', '0b155b5c-1452-40c2-9e3a-60e56a98e2b8', 'page', 10, 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 5400),
  ('book_dash', '9c9e9396-fe46-11e5-86aa-5e5517507c66', '0b155b5c-1452-40c2-9e3a-60e56a98e2b8', 'page', 11, 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e9396-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 2740),
  -- book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e94e0-fe46-11e5-86aa-5e5517507c66', '5b106471-9a5f-4a8d-ae41-2f48850c126c', 'cover', 0, 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 7900),
  ('book_dash', '9c9e94e0-fe46-11e5-86aa-5e5517507c66', '5b106471-9a5f-4a8d-ae41-2f48850c126c', 'page', 0, 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 11400),
  ('book_dash', '9c9e94e0-fe46-11e5-86aa-5e5517507c66', '5b106471-9a5f-4a8d-ae41-2f48850c126c', 'page', 1, 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 10660),
  ('book_dash', '9c9e94e0-fe46-11e5-86aa-5e5517507c66', '5b106471-9a5f-4a8d-ae41-2f48850c126c', 'page', 2, 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 12670),
  ('book_dash', '9c9e94e0-fe46-11e5-86aa-5e5517507c66', '5b106471-9a5f-4a8d-ae41-2f48850c126c', 'page', 3, 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 9380),
  ('book_dash', '9c9e94e0-fe46-11e5-86aa-5e5517507c66', '5b106471-9a5f-4a8d-ae41-2f48850c126c', 'page', 4, 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 3890),
  ('book_dash', '9c9e94e0-fe46-11e5-86aa-5e5517507c66', '5b106471-9a5f-4a8d-ae41-2f48850c126c', 'page', 5, 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 9310),
  ('book_dash', '9c9e94e0-fe46-11e5-86aa-5e5517507c66', '5b106471-9a5f-4a8d-ae41-2f48850c126c', 'page', 6, 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 7270),
  ('book_dash', '9c9e94e0-fe46-11e5-86aa-5e5517507c66', '5b106471-9a5f-4a8d-ae41-2f48850c126c', 'page', 7, 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 3770),
  ('book_dash', '9c9e94e0-fe46-11e5-86aa-5e5517507c66', '5b106471-9a5f-4a8d-ae41-2f48850c126c', 'page', 8, 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 3790),
  ('book_dash', '9c9e94e0-fe46-11e5-86aa-5e5517507c66', '5b106471-9a5f-4a8d-ae41-2f48850c126c', 'page', 9, 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 4440),
  ('book_dash', '9c9e94e0-fe46-11e5-86aa-5e5517507c66', '5b106471-9a5f-4a8d-ae41-2f48850c126c', 'page', 10, 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 5540),
  ('book_dash', '9c9e94e0-fe46-11e5-86aa-5e5517507c66', '5b106471-9a5f-4a8d-ae41-2f48850c126c', 'page', 11, 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e94e0-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 7300),
  -- book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e96ac-fe46-11e5-86aa-5e5517507c66', '628c5344-ae17-4009-93ee-0679294e4bb9', 'cover', 0, 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 7370),
  ('book_dash', '9c9e96ac-fe46-11e5-86aa-5e5517507c66', '628c5344-ae17-4009-93ee-0679294e4bb9', 'page', 0, 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 6620),
  ('book_dash', '9c9e96ac-fe46-11e5-86aa-5e5517507c66', '628c5344-ae17-4009-93ee-0679294e4bb9', 'page', 1, 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 7700),
  ('book_dash', '9c9e96ac-fe46-11e5-86aa-5e5517507c66', '628c5344-ae17-4009-93ee-0679294e4bb9', 'page', 2, 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 11950),
  ('book_dash', '9c9e96ac-fe46-11e5-86aa-5e5517507c66', '628c5344-ae17-4009-93ee-0679294e4bb9', 'page', 3, 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 7800),
  ('book_dash', '9c9e96ac-fe46-11e5-86aa-5e5517507c66', '628c5344-ae17-4009-93ee-0679294e4bb9', 'page', 4, 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 11470),
  ('book_dash', '9c9e96ac-fe46-11e5-86aa-5e5517507c66', '628c5344-ae17-4009-93ee-0679294e4bb9', 'page', 5, 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 11980),
  ('book_dash', '9c9e96ac-fe46-11e5-86aa-5e5517507c66', '628c5344-ae17-4009-93ee-0679294e4bb9', 'page', 6, 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 8350),
  ('book_dash', '9c9e96ac-fe46-11e5-86aa-5e5517507c66', '628c5344-ae17-4009-93ee-0679294e4bb9', 'page', 7, 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 5060),
  ('book_dash', '9c9e96ac-fe46-11e5-86aa-5e5517507c66', '628c5344-ae17-4009-93ee-0679294e4bb9', 'page', 8, 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 4250),
  ('book_dash', '9c9e96ac-fe46-11e5-86aa-5e5517507c66', '628c5344-ae17-4009-93ee-0679294e4bb9', 'page', 9, 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 13780),
  ('book_dash', '9c9e96ac-fe46-11e5-86aa-5e5517507c66', '628c5344-ae17-4009-93ee-0679294e4bb9', 'page', 10, 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 12100),
  ('book_dash', '9c9e96ac-fe46-11e5-86aa-5e5517507c66', '628c5344-ae17-4009-93ee-0679294e4bb9', 'page', 11, 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e96ac-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 15460),
  -- book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e9e5e-fe46-11e5-86aa-5e5517507c66', 'd5cc2dc5-1b50-49bb-afe2-8a156d2267b5', 'cover', 0, 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 9220),
  ('book_dash', '9c9e9e5e-fe46-11e5-86aa-5e5517507c66', 'd5cc2dc5-1b50-49bb-afe2-8a156d2267b5', 'page', 0, 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 7920),
  ('book_dash', '9c9e9e5e-fe46-11e5-86aa-5e5517507c66', 'd5cc2dc5-1b50-49bb-afe2-8a156d2267b5', 'page', 1, 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 7320),
  ('book_dash', '9c9e9e5e-fe46-11e5-86aa-5e5517507c66', 'd5cc2dc5-1b50-49bb-afe2-8a156d2267b5', 'page', 2, 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 7750),
  ('book_dash', '9c9e9e5e-fe46-11e5-86aa-5e5517507c66', 'd5cc2dc5-1b50-49bb-afe2-8a156d2267b5', 'page', 3, 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 7560),
  ('book_dash', '9c9e9e5e-fe46-11e5-86aa-5e5517507c66', 'd5cc2dc5-1b50-49bb-afe2-8a156d2267b5', 'page', 4, 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 7320),
  ('book_dash', '9c9e9e5e-fe46-11e5-86aa-5e5517507c66', 'd5cc2dc5-1b50-49bb-afe2-8a156d2267b5', 'page', 5, 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 7870),
  ('book_dash', '9c9e9e5e-fe46-11e5-86aa-5e5517507c66', 'd5cc2dc5-1b50-49bb-afe2-8a156d2267b5', 'page', 6, 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 7920),
  ('book_dash', '9c9e9e5e-fe46-11e5-86aa-5e5517507c66', 'd5cc2dc5-1b50-49bb-afe2-8a156d2267b5', 'page', 7, 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 7580),
  ('book_dash', '9c9e9e5e-fe46-11e5-86aa-5e5517507c66', 'd5cc2dc5-1b50-49bb-afe2-8a156d2267b5', 'page', 8, 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 7870),
  ('book_dash', '9c9e9e5e-fe46-11e5-86aa-5e5517507c66', 'd5cc2dc5-1b50-49bb-afe2-8a156d2267b5', 'page', 9, 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 7900),
  ('book_dash', '9c9e9e5e-fe46-11e5-86aa-5e5517507c66', 'd5cc2dc5-1b50-49bb-afe2-8a156d2267b5', 'page', 10, 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 8470),
  ('book_dash', '9c9e9e5e-fe46-11e5-86aa-5e5517507c66', 'd5cc2dc5-1b50-49bb-afe2-8a156d2267b5', 'page', 11, 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e9e5e-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 7800),
  -- book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9e9fc6-fe46-11e5-86aa-5e5517507c66', '5160e64e-7ad8-4e4d-8961-01d851861e14', 'cover', 0, 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 8420),
  ('book_dash', '9c9e9fc6-fe46-11e5-86aa-5e5517507c66', '5160e64e-7ad8-4e4d-8961-01d851861e14', 'page', 0, 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 3460),
  ('book_dash', '9c9e9fc6-fe46-11e5-86aa-5e5517507c66', '5160e64e-7ad8-4e4d-8961-01d851861e14', 'page', 1, 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 2350),
  ('book_dash', '9c9e9fc6-fe46-11e5-86aa-5e5517507c66', '5160e64e-7ad8-4e4d-8961-01d851861e14', 'page', 2, 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 2470),
  ('book_dash', '9c9e9fc6-fe46-11e5-86aa-5e5517507c66', '5160e64e-7ad8-4e4d-8961-01d851861e14', 'page', 3, 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 4300),
  ('book_dash', '9c9e9fc6-fe46-11e5-86aa-5e5517507c66', '5160e64e-7ad8-4e4d-8961-01d851861e14', 'page', 4, 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 3910),
  ('book_dash', '9c9e9fc6-fe46-11e5-86aa-5e5517507c66', '5160e64e-7ad8-4e4d-8961-01d851861e14', 'page', 5, 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 3620),
  ('book_dash', '9c9e9fc6-fe46-11e5-86aa-5e5517507c66', '5160e64e-7ad8-4e4d-8961-01d851861e14', 'page', 6, 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 2780),
  ('book_dash', '9c9e9fc6-fe46-11e5-86aa-5e5517507c66', '5160e64e-7ad8-4e4d-8961-01d851861e14', 'page', 7, 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 3910),
  ('book_dash', '9c9e9fc6-fe46-11e5-86aa-5e5517507c66', '5160e64e-7ad8-4e4d-8961-01d851861e14', 'page', 8, 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 4390),
  ('book_dash', '9c9e9fc6-fe46-11e5-86aa-5e5517507c66', '5160e64e-7ad8-4e4d-8961-01d851861e14', 'page', 9, 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 3260),
  ('book_dash', '9c9e9fc6-fe46-11e5-86aa-5e5517507c66', '5160e64e-7ad8-4e4d-8961-01d851861e14', 'page', 10, 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 2380),
  ('book_dash', '9c9e9fc6-fe46-11e5-86aa-5e5517507c66', '5160e64e-7ad8-4e4d-8961-01d851861e14', 'page', 11, 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9e9fc6-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 4200),
  -- book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9ea21e-fe46-11e5-86aa-5e5517507c66', '597540ce-cdfb-49d8-8f40-cdbbb18d5459', 'cover', 0, 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 10730),
  ('book_dash', '9c9ea21e-fe46-11e5-86aa-5e5517507c66', '597540ce-cdfb-49d8-8f40-cdbbb18d5459', 'page', 0, 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 14880),
  ('book_dash', '9c9ea21e-fe46-11e5-86aa-5e5517507c66', '597540ce-cdfb-49d8-8f40-cdbbb18d5459', 'page', 1, 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 22970),
  ('book_dash', '9c9ea21e-fe46-11e5-86aa-5e5517507c66', '597540ce-cdfb-49d8-8f40-cdbbb18d5459', 'page', 2, 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 17230),
  ('book_dash', '9c9ea21e-fe46-11e5-86aa-5e5517507c66', '597540ce-cdfb-49d8-8f40-cdbbb18d5459', 'page', 3, 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 12140),
  ('book_dash', '9c9ea21e-fe46-11e5-86aa-5e5517507c66', '597540ce-cdfb-49d8-8f40-cdbbb18d5459', 'page', 4, 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 28130),
  ('book_dash', '9c9ea21e-fe46-11e5-86aa-5e5517507c66', '597540ce-cdfb-49d8-8f40-cdbbb18d5459', 'page', 5, 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 18670),
  ('book_dash', '9c9ea21e-fe46-11e5-86aa-5e5517507c66', '597540ce-cdfb-49d8-8f40-cdbbb18d5459', 'page', 6, 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 22270),
  ('book_dash', '9c9ea21e-fe46-11e5-86aa-5e5517507c66', '597540ce-cdfb-49d8-8f40-cdbbb18d5459', 'page', 7, 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 14950),
  ('book_dash', '9c9ea21e-fe46-11e5-86aa-5e5517507c66', '597540ce-cdfb-49d8-8f40-cdbbb18d5459', 'page', 8, 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 24120),
  ('book_dash', '9c9ea21e-fe46-11e5-86aa-5e5517507c66', '597540ce-cdfb-49d8-8f40-cdbbb18d5459', 'page', 9, 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 27820),
  ('book_dash', '9c9ea21e-fe46-11e5-86aa-5e5517507c66', '597540ce-cdfb-49d8-8f40-cdbbb18d5459', 'page', 10, 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 22630),
  ('book_dash', '9c9ea21e-fe46-11e5-86aa-5e5517507c66', '597540ce-cdfb-49d8-8f40-cdbbb18d5459', 'page', 11, 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9ea21e-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 27380),
  -- book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9ea48a-fe46-11e5-86aa-5e5517507c66', 'e28d039f-9014-4f43-9577-12ed6f0b6655', 'cover', 0, 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 10370),
  ('book_dash', '9c9ea48a-fe46-11e5-86aa-5e5517507c66', 'e28d039f-9014-4f43-9577-12ed6f0b6655', 'page', 0, 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 6530),
  ('book_dash', '9c9ea48a-fe46-11e5-86aa-5e5517507c66', 'e28d039f-9014-4f43-9577-12ed6f0b6655', 'page', 1, 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 15310),
  ('book_dash', '9c9ea48a-fe46-11e5-86aa-5e5517507c66', 'e28d039f-9014-4f43-9577-12ed6f0b6655', 'page', 2, 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 13540),
  ('book_dash', '9c9ea48a-fe46-11e5-86aa-5e5517507c66', 'e28d039f-9014-4f43-9577-12ed6f0b6655', 'page', 3, 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 15240),
  ('book_dash', '9c9ea48a-fe46-11e5-86aa-5e5517507c66', 'e28d039f-9014-4f43-9577-12ed6f0b6655', 'page', 4, 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 12050),
  ('book_dash', '9c9ea48a-fe46-11e5-86aa-5e5517507c66', 'e28d039f-9014-4f43-9577-12ed6f0b6655', 'page', 5, 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 11040),
  ('book_dash', '9c9ea48a-fe46-11e5-86aa-5e5517507c66', 'e28d039f-9014-4f43-9577-12ed6f0b6655', 'page', 6, 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 20280),
  ('book_dash', '9c9ea48a-fe46-11e5-86aa-5e5517507c66', 'e28d039f-9014-4f43-9577-12ed6f0b6655', 'page', 7, 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 21700),
  ('book_dash', '9c9ea48a-fe46-11e5-86aa-5e5517507c66', 'e28d039f-9014-4f43-9577-12ed6f0b6655', 'page', 8, 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 4750),
  ('book_dash', '9c9ea48a-fe46-11e5-86aa-5e5517507c66', 'e28d039f-9014-4f43-9577-12ed6f0b6655', 'page', 9, 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 8860),
  ('book_dash', '9c9ea48a-fe46-11e5-86aa-5e5517507c66', 'e28d039f-9014-4f43-9577-12ed6f0b6655', 'page', 10, 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 9430),
  ('book_dash', '9c9ea48a-fe46-11e5-86aa-5e5517507c66', 'e28d039f-9014-4f43-9577-12ed6f0b6655', 'page', 11, 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9ea48a-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 4420),
  -- book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9ea96c-fe46-11e5-86aa-5e5517507c66', '0d9d9fdd-4f51-489e-b075-7f1e6fec2efc', 'cover', 0, 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 6860),
  ('book_dash', '9c9ea96c-fe46-11e5-86aa-5e5517507c66', '0d9d9fdd-4f51-489e-b075-7f1e6fec2efc', 'page', 0, 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 14740),
  ('book_dash', '9c9ea96c-fe46-11e5-86aa-5e5517507c66', '0d9d9fdd-4f51-489e-b075-7f1e6fec2efc', 'page', 1, 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 15770),
  ('book_dash', '9c9ea96c-fe46-11e5-86aa-5e5517507c66', '0d9d9fdd-4f51-489e-b075-7f1e6fec2efc', 'page', 2, 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 4510),
  ('book_dash', '9c9ea96c-fe46-11e5-86aa-5e5517507c66', '0d9d9fdd-4f51-489e-b075-7f1e6fec2efc', 'page', 3, 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 9260),
  ('book_dash', '9c9ea96c-fe46-11e5-86aa-5e5517507c66', '0d9d9fdd-4f51-489e-b075-7f1e6fec2efc', 'page', 4, 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 19440),
  ('book_dash', '9c9ea96c-fe46-11e5-86aa-5e5517507c66', '0d9d9fdd-4f51-489e-b075-7f1e6fec2efc', 'page', 5, 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 12940),
  ('book_dash', '9c9ea96c-fe46-11e5-86aa-5e5517507c66', '0d9d9fdd-4f51-489e-b075-7f1e6fec2efc', 'page', 6, 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 13030),
  ('book_dash', '9c9ea96c-fe46-11e5-86aa-5e5517507c66', '0d9d9fdd-4f51-489e-b075-7f1e6fec2efc', 'page', 7, 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 10250),
  ('book_dash', '9c9ea96c-fe46-11e5-86aa-5e5517507c66', '0d9d9fdd-4f51-489e-b075-7f1e6fec2efc', 'page', 8, 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 13630),
  ('book_dash', '9c9ea96c-fe46-11e5-86aa-5e5517507c66', '0d9d9fdd-4f51-489e-b075-7f1e6fec2efc', 'page', 9, 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 8690),
  ('book_dash', '9c9ea96c-fe46-11e5-86aa-5e5517507c66', '0d9d9fdd-4f51-489e-b075-7f1e6fec2efc', 'page', 10, 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 9860),
  ('book_dash', '9c9ea96c-fe46-11e5-86aa-5e5517507c66', '0d9d9fdd-4f51-489e-b075-7f1e6fec2efc', 'page', 11, 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9ea96c-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 10460),
  -- book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66  (page 13 + cover 1)
  ('book_dash', '9c9eb2cc-fe46-11e5-86aa-5e5517507c66', '0d5c90ad-cd47-46e1-a80a-2ba005b3c73b', 'cover', 0, 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 7700),
  ('book_dash', '9c9eb2cc-fe46-11e5-86aa-5e5517507c66', '0d5c90ad-cd47-46e1-a80a-2ba005b3c73b', 'page', 0, 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 4970),
  ('book_dash', '9c9eb2cc-fe46-11e5-86aa-5e5517507c66', '0d5c90ad-cd47-46e1-a80a-2ba005b3c73b', 'page', 1, 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 5880),
  ('book_dash', '9c9eb2cc-fe46-11e5-86aa-5e5517507c66', '0d5c90ad-cd47-46e1-a80a-2ba005b3c73b', 'page', 2, 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 6480),
  ('book_dash', '9c9eb2cc-fe46-11e5-86aa-5e5517507c66', '0d5c90ad-cd47-46e1-a80a-2ba005b3c73b', 'page', 3, 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 6020),
  ('book_dash', '9c9eb2cc-fe46-11e5-86aa-5e5517507c66', '0d5c90ad-cd47-46e1-a80a-2ba005b3c73b', 'page', 4, 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 3050),
  ('book_dash', '9c9eb2cc-fe46-11e5-86aa-5e5517507c66', '0d5c90ad-cd47-46e1-a80a-2ba005b3c73b', 'page', 5, 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 7100),
  ('book_dash', '9c9eb2cc-fe46-11e5-86aa-5e5517507c66', '0d5c90ad-cd47-46e1-a80a-2ba005b3c73b', 'page', 6, 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 4920),
  ('book_dash', '9c9eb2cc-fe46-11e5-86aa-5e5517507c66', '0d5c90ad-cd47-46e1-a80a-2ba005b3c73b', 'page', 7, 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 3480),
  ('book_dash', '9c9eb2cc-fe46-11e5-86aa-5e5517507c66', '0d5c90ad-cd47-46e1-a80a-2ba005b3c73b', 'page', 8, 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 5620),
  ('book_dash', '9c9eb2cc-fe46-11e5-86aa-5e5517507c66', '0d5c90ad-cd47-46e1-a80a-2ba005b3c73b', 'page', 9, 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 7460),
  ('book_dash', '9c9eb2cc-fe46-11e5-86aa-5e5517507c66', '0d5c90ad-cd47-46e1-a80a-2ba005b3c73b', 'page', 10, 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 5780),
  ('book_dash', '9c9eb2cc-fe46-11e5-86aa-5e5517507c66', '0d5c90ad-cd47-46e1-a80a-2ba005b3c73b', 'page', 11, 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 5420),
  ('book_dash', '9c9eb2cc-fe46-11e5-86aa-5e5517507c66', '0d5c90ad-cd47-46e1-a80a-2ba005b3c73b', 'page', 12, 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p13.mp3', 'book_dash-9c9eb2cc-fe46-11e5-86aa-5e5517507c66/danielle/p13.marks.json', 4370),
  -- book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9eb68c-fe46-11e5-86aa-5e5517507c66', '843f348f-7e69-4a1f-84b3-0eaae42a3d62', 'cover', 0, 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 10820),
  ('book_dash', '9c9eb68c-fe46-11e5-86aa-5e5517507c66', '843f348f-7e69-4a1f-84b3-0eaae42a3d62', 'page', 0, 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 6500),
  ('book_dash', '9c9eb68c-fe46-11e5-86aa-5e5517507c66', '843f348f-7e69-4a1f-84b3-0eaae42a3d62', 'page', 1, 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 9500),
  ('book_dash', '9c9eb68c-fe46-11e5-86aa-5e5517507c66', '843f348f-7e69-4a1f-84b3-0eaae42a3d62', 'page', 2, 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 8760),
  ('book_dash', '9c9eb68c-fe46-11e5-86aa-5e5517507c66', '843f348f-7e69-4a1f-84b3-0eaae42a3d62', 'page', 3, 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 7460),
  ('book_dash', '9c9eb68c-fe46-11e5-86aa-5e5517507c66', '843f348f-7e69-4a1f-84b3-0eaae42a3d62', 'page', 4, 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 7800),
  ('book_dash', '9c9eb68c-fe46-11e5-86aa-5e5517507c66', '843f348f-7e69-4a1f-84b3-0eaae42a3d62', 'page', 5, 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 8350),
  ('book_dash', '9c9eb68c-fe46-11e5-86aa-5e5517507c66', '843f348f-7e69-4a1f-84b3-0eaae42a3d62', 'page', 6, 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 8710),
  ('book_dash', '9c9eb68c-fe46-11e5-86aa-5e5517507c66', '843f348f-7e69-4a1f-84b3-0eaae42a3d62', 'page', 7, 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 8020),
  ('book_dash', '9c9eb68c-fe46-11e5-86aa-5e5517507c66', '843f348f-7e69-4a1f-84b3-0eaae42a3d62', 'page', 8, 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 8810),
  ('book_dash', '9c9eb68c-fe46-11e5-86aa-5e5517507c66', '843f348f-7e69-4a1f-84b3-0eaae42a3d62', 'page', 9, 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 8950),
  ('book_dash', '9c9eb68c-fe46-11e5-86aa-5e5517507c66', '843f348f-7e69-4a1f-84b3-0eaae42a3d62', 'page', 10, 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 13540),
  ('book_dash', '9c9eb68c-fe46-11e5-86aa-5e5517507c66', '843f348f-7e69-4a1f-84b3-0eaae42a3d62', 'page', 11, 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9eb68c-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 5300),
  -- book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'cover', 0, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 8830),
  ('book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 0, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 4059),
  ('book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 1, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 2210),
  ('book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 2, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 7220),
  ('book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 3, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 5470),
  ('book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 4, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 6890),
  ('book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 5, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 8810),
  ('book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 6, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 5590),
  ('book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 7, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 5040),
  ('book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 8, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 7250),
  ('book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 9, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 3550),
  ('book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 10, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 10270),
  ('book_dash', '9c9f3292-fe46-11e5-86aa-5e5517507c66', '92efecf3-2aa2-4857-9b69-c79e5e6efebf', 'page', 11, 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9f3292-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 2930),
  -- book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66  (page 12 + cover 1)
  ('book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'cover', 0, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/cover.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/cover.marks.json', 9980),
  ('book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 0, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p01.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p01.marks.json', 8880),
  ('book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 1, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p02.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p02.marks.json', 10630),
  ('book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 2, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p03.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p03.marks.json', 9140),
  ('book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 3, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p04.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p04.marks.json', 8830),
  ('book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 4, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p05.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p05.marks.json', 6980),
  ('book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 5, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p06.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p06.marks.json', 5620),
  ('book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 6, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p07.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p07.marks.json', 4420),
  ('book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 7, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p08.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p08.marks.json', 13200),
  ('book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 8, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p09.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p09.marks.json', 8380),
  ('book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 9, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p10.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p10.marks.json', 11090),
  ('book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 10, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p11.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p11.marks.json', 15480),
  ('book_dash', '9c9f566e-fe46-11e5-86aa-5e5517507c66', '1252ee12-ec89-4377-8b66-04259aae2b24', 'page', 11, 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p12.mp3', 'book_dash-9c9f566e-fe46-11e5-86aa-5e5517507c66/danielle/p12.marks.json', 7250);

-- ============================================================
-- [2] 스테이징 자체 검증 — 매니페스트가 그대로 올라왔는가
-- ============================================================
-- 기대: staged_rows 507 / staged_books 39 / page 468 / cover 39
SELECT count(*)                               AS staged_rows,
       count(DISTINCT source_id)              AS staged_books,
       count(*) FILTER (WHERE kind = 'page')  AS page_rows,
       count(*) FILTER (WHERE kind = 'cover') AS cover_rows
  FROM _stage_load708_step3;

-- 스테이징 내부 중복·결측 (기대: 전부 0)
SELECT
  (SELECT count(*) FROM (SELECT 1 FROM _stage_load708_step3
      GROUP BY source_platform, source_id, kind, page_index HAVING count(*) > 1) t)
                                                    AS dup_unit_key,
  (SELECT count(*) FROM (SELECT 1 FROM _stage_load708_step3
      GROUP BY audio_path HAVING count(*) > 1) t)    AS dup_audio_path,
  (SELECT count(*) FROM _stage_load708_step3 WHERE duration_ms IS NULL) AS null_duration,
  (SELECT count(*) FROM _stage_load708_step3 WHERE marks_path IS NULL)  AS null_marks,
  (SELECT count(*) FROM _stage_load708_step3
    WHERE audio_path LIKE 'book-audio/%'
       OR audio_path NOT LIKE '%/danielle/%')          AS bad_path;

-- ============================================================
-- [3] book_id 매핑 검증 — (source_platform, source_id) → books.id
-- ============================================================
-- 기대: mapped_books 39 / unmapped_rows 0 / mismatched_rows 0
--   unmapped  = books에 그 (platform, source_id)가 없음
--   mismatched= books.id 와 매니페스트 book_id 불일치
SELECT
  (SELECT count(DISTINCT b.id)
     FROM _stage_load708_step3 s JOIN public.books b
       ON b.source_platform = s.source_platform AND b.source_id = s.source_id)
                                                     AS mapped_books,
  (SELECT count(*) FROM _stage_load708_step3 s WHERE NOT EXISTS (
      SELECT 1 FROM public.books b
       WHERE b.source_platform = s.source_platform AND b.source_id = s.source_id))
                                                     AS unmapped_rows,
  (SELECT count(*) FROM _stage_load708_step3 s JOIN public.books b
       ON b.source_platform = s.source_platform AND b.source_id = s.source_id
    WHERE b.id <> s.manifest_book_id)                AS mismatched_rows;

-- 하드 가드 — 위 셋 중 하나라도 어긋나면 여기서 트랜잭션을 죽인다(fail-closed).
DO $$
DECLARE v_unmapped int; v_mismatch int; v_books int;
BEGIN
  SELECT count(*) INTO v_unmapped FROM _stage_load708_step3 s WHERE NOT EXISTS (
    SELECT 1 FROM public.books b
     WHERE b.source_platform = s.source_platform AND b.source_id = s.source_id);
  SELECT count(*) INTO v_mismatch FROM _stage_load708_step3 s JOIN public.books b
     ON b.source_platform = s.source_platform AND b.source_id = s.source_id
   WHERE b.id <> s.manifest_book_id;
  SELECT count(DISTINCT source_id) INTO v_books FROM _stage_load708_step3;
  IF v_unmapped <> 0 THEN
    RAISE EXCEPTION 'STOP: books 매핑 실패 % 행 — 적재 중단', v_unmapped;
  END IF;
  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION 'STOP: 매니페스트 book_id 불일치 % 행 — 적재 중단', v_mismatch;
  END IF;
  IF v_books <> 39 THEN
    RAISE EXCEPTION 'STOP: 스테이징 권수 % ≠ 기대 39 — 적재 중단', v_books;
  END IF;
END $$;

-- ============================================================
-- [4] 충돌 사전 검사 — (book_id, kind, page_index, voice) 기준
-- ============================================================
-- 기대: conflict_rows 0 (신규 삽입만 발생). 1건이라도 있으면 기존 행을 건드린다는 뜻.
SELECT count(*) AS conflict_rows
  FROM _stage_load708_step3 s
  JOIN public.books b
    ON b.source_platform = s.source_platform AND b.source_id = s.source_id
  JOIN public.book_audio a
    ON a.book_id = b.id AND a.kind = s.kind
   AND a.page_index = s.page_index AND a.voice = 'danielle';

-- 참고: audio_path 기준 충돌(다른 voice 층위 포함) — 기대 0
SELECT count(*) AS conflict_audio_path
  FROM _stage_load708_step3 s JOIN public.book_audio a ON a.audio_path = s.audio_path;

-- 하드 가드 — 충돌이 있으면 여기서 죽인다.
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM _stage_load708_step3 s
    JOIN public.books b
      ON b.source_platform = s.source_platform AND b.source_id = s.source_id
    JOIN public.book_audio a
      ON a.book_id = b.id AND a.kind = s.kind
     AND a.page_index = s.page_index AND a.voice = 'danielle';
  IF v <> 0 THEN
    RAISE EXCEPTION 'STOP: 기존 행과 충돌 % 건 — 적재 중단', v;
  END IF;
  SELECT count(*) INTO v FROM _stage_load708_step3 s
    JOIN public.book_audio a ON a.audio_path = s.audio_path;
  IF v <> 0 THEN
    RAISE EXCEPTION 'STOP: audio_path 중복 % 건 — 적재 중단', v;
  END IF;
END $$;

-- ============================================================
-- [5] book_audio INSERT — 39권 / 507행
-- ============================================================
-- ON CONFLICT 절 없음 = 덮어쓰기 불가. [4]를 통과했으므로 전량 신규 삽입이다.
INSERT INTO public.book_audio
  (book_id, kind, page_index, audio_path, marks_path, voice, engine, rate, duration_ms)
SELECT b.id, s.kind, s.page_index, s.audio_path, s.marks_path,
       'danielle', 'long-form', 85, s.duration_ms
  FROM _stage_load708_step3 s
  JOIN public.books b
    ON b.source_platform = s.source_platform AND b.source_id = s.source_id;

-- ============================================================
-- [6] 사후 검증
-- ============================================================
-- 기대: danielle_books 836 / danielle_rows 9592 / page 8756 / cover 836
--   (= 적재 전 797권 9085행 + 본 step 39권 507행)
SELECT count(DISTINCT book_id) AS danielle_books,
       count(*)                               AS danielle_rows,
       count(*) FILTER (WHERE kind = 'page')  AS page_rows,
       count(*) FILTER (WHERE kind = 'cover') AS cover_rows
  FROM public.book_audio WHERE voice = 'danielle';

-- 본 step 적재분만 재확인 (기대: books 39 / rows 507 / page 468 / cover 39)
SELECT count(DISTINCT a.book_id)                 AS step_books,
       count(*)                                  AS step_rows,
       count(*) FILTER (WHERE a.kind = 'page')   AS page_rows,
       count(*) FILTER (WHERE a.kind = 'cover')  AS cover_rows
  FROM public.book_audio a
  JOIN _stage_load708_step3 s ON s.audio_path = a.audio_path;

-- 표지 누락 권 (기대: 0) — 본 step 39권 중 cover 행이 없는 책
SELECT count(*) AS books_missing_cover FROM (
  SELECT b.id FROM public.books b
   WHERE b.source_platform = 'book_dash'
     AND b.source_id IN (SELECT DISTINCT source_id FROM _stage_load708_step3)
     AND NOT EXISTS (SELECT 1 FROM public.book_audio a
                      WHERE a.book_id = b.id AND a.voice = 'danielle' AND a.kind = 'cover')
) t;

-- 경로 규약 위반 (기대: 0) — 버킷명 접두사 혼입 · 성우 층위 누락
SELECT count(*) AS bad_path FROM public.book_audio
 WHERE voice = 'danielle'
   AND (audio_path LIKE 'book-audio/%' OR audio_path NOT LIKE '%/danielle/%');

-- duration_ms NULL (기대: 0)
SELECT count(*) AS null_duration FROM public.book_audio WHERE voice = 'danielle' AND duration_ms IS NULL;

-- 구 44권 무간섭 확인 (기대: [0]과 동일한 44 / 574)
SELECT count(DISTINCT book_id) AS ruth_books, count(*) AS ruth_rows
  FROM public.book_audio WHERE voice = 'Ruth';

-- ============================================================
ROLLBACK;
-- ============================================================

-- ┌──────────────────────────────────────────────────────────┐
-- │ step3 (book_dash) 기대값 대조표 — 팀장 확인용
-- ├──────────────────────────────────────────────────────────┤
-- │ [0] 적재 전   danielle  books  797  rows  9085  page  8288  cover  797
-- │             Ruth      books   44  rows   574
-- │ [2] 스테이징  rows   507  books   39  page   468  cover   39
-- │             dup_unit_key 0 · dup_audio_path 0 · null_duration 0
-- │             null_marks 0 · bad_path 0
-- │ [3] 매핑      mapped_books   39 · unmapped_rows 0 · mismatched_rows 0
-- │ [4] 충돌      conflict_rows 0 · conflict_audio_path 0
-- │ [5] INSERT   507행
-- │ [6] 적재 후   danielle  books  836  rows  9592  page  8756  cover  836
-- │             step 적재분 books   39  rows   507
-- │             books_missing_cover 0 · bad_path 0 · null_duration 0
-- │             Ruth      books   44  rows   574 (불변)
-- ├──────────────────────────────────────────────────────────┤
-- │ 전부 일치하면 위 ROLLBACK; 을 COMMIT; 으로 바꿔 재실행.
-- │ 하나라도 다르면 COMMIT 하지 말고 워커에게 수치를 그대로 전달할 것.
-- └──────────────────────────────────────────────────────────┘
