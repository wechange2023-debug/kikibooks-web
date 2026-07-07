-- step7_book_audio_cover_schema.sql — book_audio 표지 수용 스키마 변경 (ADR-0034 Amendment #1, 안 A)
-- 실행: 팀장(Supabase SQL Editor). 워커는 초안만 제시(DB 직접 쓰기 금지).
--
-- 결정(ADR-0034 Amd#1): 표지 오디오를 book_audio 에 kind 컬럼으로 수용.
--   kind TEXT NOT NULL DEFAULT 'page' CHECK (kind IN ('page','cover'))
--   표지 행: kind='cover', page_index=0 고정(경로는 audio_path 에 cover.mp3 로 명시 → page_index 무의미).
--   UNIQUE 재정의: (book_id, page_index, voice) → (book_id, kind, page_index, voice)
--     · 표지(cover,0,voice)와 첫 페이지(page,0,voice)의 page_index=0 충돌 방지 + 책·보이스당 표지 1행 보장.
--   기존 page 행: 기본값 'page' 백필로 무손실(새 UNIQUE 자동 충족).
--   ※ book_audio 는 아직 INSERT 전(빈 테이블)이라 UNIQUE 재정의 무위험. 데이터 있어도 page 행은 안전.
--   ※ 전 구간 트랜잭션(BEGIN/COMMIT) — 중간 실패 시 자동 원복. synced_at 등 시간조건 미사용.
--   ※ DO 블록 가드로 재실행 안전(idempotent).

-- ─────────────────────────────────────────────────────────────────────────
-- [선검증] 현행 컬럼 · 제약 조회 (변경 전 스냅샷)
-- ─────────────────────────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'book_audio'
ORDER BY ordinal_position;

SELECT conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.book_audio'::regclass
ORDER BY contype, conname;

-- ─────────────────────────────────────────────────────────────────────────
-- [DDL] 표지 수용 — 트랜잭션 (실패 시 전체 원복)
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

-- (1) kind 컬럼 추가. 기존 행은 DEFAULT 'page' 로 자동 백필(무손실).
ALTER TABLE public.book_audio
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'page';

-- (2) kind 값 가드 CHECK (재실행 안전)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.book_audio'::regclass
      AND conname = 'book_audio_kind_check'
  ) THEN
    ALTER TABLE public.book_audio
      ADD CONSTRAINT book_audio_kind_check CHECK (kind IN ('page', 'cover'));
  END IF;
END $$;

-- (3) 기존 UNIQUE(book_id,page_index,voice) 제거 — 자동생성 이름에 무관하게 안전 탐색.
--     ⚠ 파괴적(제약 DROP): 새 복합 UNIQUE로 대체하기 위함. page 행 유일성은 (4)에서 승계.
--     롤백: 표지 행 적재 전이면 (4) 제약 DROP 후 이 UNIQUE 재생성으로 원복 가능.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.book_audio'::regclass
      AND contype = 'u'
      AND conname <> 'book_audio_book_kind_page_voice_key'
  LOOP
    EXECUTE format('ALTER TABLE public.book_audio DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- (4) 새 복합 UNIQUE(book_id,kind,page_index,voice) 추가 (재실행 안전)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.book_audio'::regclass
      AND conname = 'book_audio_book_kind_page_voice_key'
  ) THEN
    ALTER TABLE public.book_audio
      ADD CONSTRAINT book_audio_book_kind_page_voice_key
      UNIQUE (book_id, kind, page_index, voice);
  END IF;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- [후검증] 변경 후 컬럼 · 제약 재조회 (기대: kind 컬럼 존재 / UNIQUE = book_id,kind,page_index,voice
--          / CHECK kind IN ('page','cover') / page_index CHECK(>=0) 유지)
-- ─────────────────────────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'book_audio'
ORDER BY ordinal_position;

SELECT conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.book_audio'::regclass
ORDER BY contype, conname;

-- ─────────────────────────────────────────────────────────────────────────
-- [전체 롤백 스크립트 — 필요 시, 표지 행 적재 전에만 안전]
--   BEGIN;
--     ALTER TABLE public.book_audio DROP CONSTRAINT IF EXISTS book_audio_book_kind_page_voice_key;
--     ALTER TABLE public.book_audio DROP CONSTRAINT IF EXISTS book_audio_kind_check;
--     ALTER TABLE public.book_audio ADD CONSTRAINT book_audio_book_id_page_index_voice_key
--       UNIQUE (book_id, page_index, voice);
--     ALTER TABLE public.book_audio DROP COLUMN IF EXISTS kind;
--   COMMIT;
--   ※ 표지(kind='cover') 행이 이미 적재됐다면 DROP COLUMN 전에 그 행부터 삭제해야
--     옛 UNIQUE(book_id,page_index,voice)에서 p00과 충돌하지 않음.
