-- 목적: books.content_type 화이트리스트에 'asb_native' 추가
--       (ADR-0025 ASb 자체 렌더 콘텐츠 — 텍스트+페이지 이미지 자체 렌더, Amd#3)
-- ADR: docs/adr/0025-asb-content-ingestion.md Amendment #5 (선행 ADR, A1·A2)
--      배경: Amd#3 A3(자체 렌더 → content_type 'asb_native') 예고분의 구현.
-- 적용일: 2026-06-17 (작성) / 적용은 PM이 Supabase SQL Editor에서 직접 실행
-- 적용 방법: PM이 Supabase Dashboard → SQL Editor에 본 파일 전체를 붙여넣어 실행.
--            (워커/CI는 DB에 직접 접근하지 않음. 코드 push만으로는 DB 미반영.)
-- 주의: 본 마이그레이션은 화이트리스트를 '확장'(콘텐츠 타입 1종 추가)하며 완화가 아님.
--       트리거 DROP/DISABLE 없음 — content_type에는 연결 트리거가 없고,
--       license의 enforce_commercial_license 트리거는 본 변경 대상이 아님 (Hard Rule 2 무저촉).
--       (CHECK 제약은 무명→named 재정의. 003 source_platform 마이그레이션과 동일 패턴.)

-- =============================================================================
-- content_type CHECK 제약 재정의 — ADR-0025 Amendment #5 A2
-- =============================================================================
-- 001_initial_schema.sql의 books.content_type CHECK는 인라인 '무명' 제약이라
-- PostgreSQL이 자동 제약명(books_content_type_check 류)을 부여했다. 자동명 하드코딩은
-- 환경별 충돌 위험이 있으므로, pg_constraint에서 'h5p' 리터럴을 포함하는
-- content_type 화이트리스트 CHECK를 동적으로 찾아 DROP한 뒤 named constraint로 재추가한다.
-- ('h5p'는 content_type 화이트리스트 CHECK에만 등장 → 다른 CHECK 오매치 없음.)
-- 본 DO 블록은 재실행 시 새로 만든 named 제약(역시 h5p 포함)도 함께 DROP하므로
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
      AND pg_get_constraintdef(oid) LIKE '%h5p%'
  LOOP
    EXECUTE format('ALTER TABLE public.books DROP CONSTRAINT %I', v_conname);
  END LOOP;
END $$;

ALTER TABLE public.books
  ADD CONSTRAINT books_content_type_whitelist_chk
  CHECK (content_type IN (
    'html',
    'epub',
    'h5p',
    'pdf',
    'asb_native'
  ));

-- =============================================================================
-- 적용 후 수동 확인 (참고 — 실행 의무 아님)
-- =============================================================================
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.books'::regclass AND contype = 'c'
--     AND pg_get_constraintdef(oid) LIKE '%asb_native%';
-- → books_content_type_whitelist_chk 1건, def에 5종 포함 확인.
