-- 목적: books.source_platform 화이트리스트에 'african_storybook' 추가
--       (ADR-0025 ASb 콘텐츠 적재 — 순증 상한 ≈2,762권 적재 차단 해제)
-- ADR: docs/adr/0025-asb-content-ingestion.md Amendment #1 (선행 ADR, A1·A2)
--      상위 설계: docs/adr/0022-content-source-expansion.md Amendment #2 (D1)
-- 적용일: 2026-06-17 (작성) / 적용은 PM이 Supabase SQL Editor에서 직접 실행
-- 적용 방법: PM이 Supabase Dashboard → SQL Editor에 본 파일 전체를 붙여넣어 실행.
--            (워커/CI는 DB에 직접 접근하지 않음. 코드 push만으로는 DB 미반영.)
-- 주의: 본 마이그레이션은 화이트리스트를 '확장'(적격 source 1종 추가)하며 완화가 아님.
--       트리거 DROP/DISABLE 없음 — source_platform에는 연결 트리거가 없고,
--       license의 enforce_commercial_license 트리거는 본 변경 대상이 아님 (Hard Rule 2 무저촉).
--       (CHECK 제약은 무명→named 재정의. 002 license 마이그레이션과 동일 패턴.)

-- =============================================================================
-- source_platform CHECK 제약 재정의 — ADR-0025 Amendment #1 A2
-- =============================================================================
-- 001_initial_schema.sql의 books.source_platform CHECK는 인라인 '무명' 제약이라
-- PostgreSQL이 자동 제약명(books_source_platform_check 류)을 부여했다. 자동명 하드코딩은
-- 환경별 충돌 위험이 있으므로, pg_constraint에서 'book_dash' 리터럴을 포함하는
-- source_platform 화이트리스트 CHECK를 동적으로 찾아 DROP한 뒤 named constraint로 재추가한다.
-- ('book_dash'는 source_platform 화이트리스트 CHECK에만 등장 → 다른 CHECK 오매치 없음.)
-- 본 DO 블록은 재실행 시 새로 만든 named 제약(역시 book_dash 포함)도 함께 DROP하므로
-- 멱등하다.
DO $$
DECLARE
  v_conname text;
BEGIN
  FOR v_conname IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.books'::regclass
      AND contype  = 'c'
      AND pg_get_constraintdef(oid) LIKE '%book_dash%'
  LOOP
    EXECUTE format('ALTER TABLE public.books DROP CONSTRAINT %I', v_conname);
  END LOOP;
END $$;

ALTER TABLE public.books
  ADD CONSTRAINT books_source_platform_whitelist_chk
  CHECK (source_platform IN (
    'book_dash',
    'gdl',
    'librivox',
    'pg',
    'jybooks',
    'wjjr',
    'magic_light',
    'african_storybook'
  ));

-- =============================================================================
-- 적용 후 수동 확인 (참고 — 실행 의무 아님)
-- =============================================================================
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.books'::regclass AND contype = 'c'
--     AND pg_get_constraintdef(oid) LIKE '%african_storybook%';
-- → books_source_platform_whitelist_chk 1건, def에 8종 포함 확인.
