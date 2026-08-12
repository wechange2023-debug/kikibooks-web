-- 00_staging_create.sql — 영구 staging 테이블 생성 (실행 순서 1/N)
-- 생성: scripts/tts_pilot/gen_book_audio_sql_708.py (워커, DB 접속 0건)
-- 근거: ADR-0053 D4(전량 확장) / ADR-0034(결정 ①②③ + Amd#1 kind · Amd#2 성우 층위)
--       / ADR-0052 D5(page_index 축) · Amd#2(rate 의미) · D8(워커 DB 직접 쓰기 금지)
--
-- ★ 이 파일은 본 테이블(book_audio)을 건드리지 않는다. staging 테이블 1개만 만든다.
-- ★ TEMP 테이블을 쓰지 않는 이유: SQL Editor는 실행마다 세션이 유지된다는 보장이 없어
--   TEMP 테이블이 청크 사이에 사라질 수 있다. 그래서 영구 테이블로 만들고 07에서 지운다.
--
-- 멱등: CREATE TABLE IF NOT EXISTS 라 여러 번 실행해도 안전하다.
--
-- ┌─ 재적재(다시 처음부터) 하고 싶을 때 ──────────────────────────────┐
-- │ TRUNCATE public.book_audio_staging_708;
-- │ 를 먼저 실행한 뒤 01_chunk_01 부터 다시 돌린다.
-- │ ※ 보통은 TRUNCATE가 필요 없다. 청크는 ON CONFLICT (audio_path) DO NOTHING
-- │   이라 같은 청크를 몇 번 돌려도 중복이 쌓이지 않는다(멱등).
-- │   중간에 실패했다면 그냥 실패한 청크부터 이어서 실행하면 된다.
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS public.book_audio_staging_708 (
  chunk_no         int  NOT NULL,
  source_platform  text NOT NULL,
  source_id        text NOT NULL,
  manifest_book_id uuid NOT NULL,
  kind             text NOT NULL,
  page_index       int  NOT NULL,
  audio_path       text NOT NULL,
  marks_path       text,
  duration_ms      int  NOT NULL,
  CONSTRAINT book_audio_staging_708_audio_path_key UNIQUE (audio_path)
);

-- books 조인용 인덱스 (머지 단계 성능)
CREATE INDEX IF NOT EXISTS book_audio_staging_708_src_idx
  ON public.book_audio_staging_708 (source_platform, source_id);

-- RLS 켜고 정책은 만들지 않는다 → anon/authenticated 접근 전면 차단.
-- SQL Editor(테이블 소유자)와 service_role은 RLS를 우회하므로 작업에 지장 없다.
-- (books · book_audio 선례 — ADR-0034 Phase A-1 [3])
ALTER TABLE public.book_audio_staging_708 ENABLE ROW LEVEL SECURITY;

-- 확인 (기대: staging_exists = book_audio_staging_708 / staging_rows = 0)
SELECT to_regclass('public.book_audio_staging_708') AS staging_exists,
       (SELECT count(*) FROM public.book_audio_staging_708)            AS staging_rows;

-- ┌──────────────────────────────────────────────────────────┐
-- │ 00 기대값
-- ├──────────────────────────────────────────────────────────┤
-- │ staging_exists  book_audio_staging_708
-- │ staging_rows    0   (재실행 시에는 그때까지 적재된 행 수)
-- ├──────────────────────────────────────────────────────────┤
-- │ 다음: 01_chunk_01 ~ 01_chunk_12 를 순서대로 실행
-- │       (총 12개 파일 / 최종 7,978행)
-- └──────────────────────────────────────────────────────────┘
