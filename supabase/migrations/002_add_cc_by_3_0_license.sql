-- 목적: books.license 화이트리스트에 cc-by-3-0 추가 (GDL 심화 842→~937)
-- ADR: docs/adr/0022-content-source-expansion.md 참조 (선행 ADR, §2.2)
-- 적용일: 2026-06-15
-- 주의: 본 마이그레이션은 차단망을 '확장'(적격 1종 추가)하며 완화가 아님.
--       DROP/DISABLE 없음 — README 후속 체크리스트 무저촉.
--       (CHECK 제약은 무명→named 재정의이며, 트리거 함수는 OR REPLACE 갱신.)

-- =============================================================================
-- (a) CHECK 제약 재정의 — license-rules.md 3.1절
-- =============================================================================
-- 001_initial_schema.sql의 books.license CHECK는 인라인 '무명' 제약이라
-- PostgreSQL이 자동 제약명(books_license_check 류)을 부여했다. 자동명 하드코딩은
-- 환경별 충돌 위험이 있으므로, pg_constraint에서 'cc-by-4-0' 리터럴을 포함하는
-- license 화이트리스트 CHECK를 동적으로 찾아 DROP한 뒤 named constraint로 재추가한다.
-- ('cc-by-4-0'는 license 화이트리스트 CHECK에만 등장 → 다른 CHECK 오매치 없음.)
-- 본 DO 블록은 재실행 시 새로 만든 named 제약(역시 cc-by-4-0 포함)도 함께 DROP하므로
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
      AND pg_get_constraintdef(oid) LIKE '%cc-by-4-0%'
  LOOP
    EXECUTE format('ALTER TABLE public.books DROP CONSTRAINT %I', v_conname);
  END LOOP;
END $$;

ALTER TABLE public.books
  ADD CONSTRAINT books_license_whitelist_chk
  CHECK (license IN (
    'cc-by-4-0',
    'cc-by-sa-4-0',
    'cc0',
    'public-domain',
    'cc-by-3-0'
  ));

-- =============================================================================
-- (b) 트리거 함수 갱신 — license-rules.md 3.2절 (★ Hard Rule 2 — DROP/DISABLE 금지)
-- =============================================================================
-- 화이트리스트 IN 절에 'cc-by-3-0'만 추가. 나머지 본문은 001과 동일.
-- 트리거 자체(books_license_check)는 함수를 참조하므로 재생성 불요(함수만 교체).
-- CREATE OR REPLACE라 자연 멱등.
CREATE OR REPLACE FUNCTION enforce_commercial_license()
RETURNS trigger AS $$
BEGIN
  IF NEW.license NOT IN ('cc-by-4-0', 'cc-by-sa-4-0', 'cc0', 'public-domain', 'cc-by-3-0') THEN
    RAISE EXCEPTION '상업 사용 불가 라이선스 차단: %', NEW.license;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 적용 후 수동 확인 (참고 — 실행 의무 아님)
-- =============================================================================
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.books'::regclass AND contype = 'c'
--     AND pg_get_constraintdef(oid) LIKE '%cc-by-3-0%';
-- → books_license_whitelist_chk 1건, def에 5종 포함 확인.
