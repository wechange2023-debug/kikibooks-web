-- 목적: source_platform 화이트리스트에 'bloom' 추가 (9번째 소스)
-- ADR: ADR-0028 (D2) + Amendment #2 (5절)
-- 적용일: (PM이 SQL Editor 실행 시 기입)
-- 적용: PM이 Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run
-- 주의: source_platform은 CHECK 제약만 사용(트리거 없음). enforce_commercial_license
--       (license 전용)는 본 변경과 무관 — DROP/DISABLE 하지 않음 (Hard Rule 2 무저촉).

-- (a) 기존 source_platform CHECK 제약 동적 DROP (무명·named 모두 포착)
DO $$
DECLARE v_conname text;
BEGIN
  FOR v_conname IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.books'::regclass
      AND contype  = 'c'
      AND pg_get_constraintdef(oid) LIKE '%book_dash%'
  LOOP
    EXECUTE format('ALTER TABLE public.books DROP CONSTRAINT %I', v_conname);
  END LOOP;
END $$;

-- (b) named constraint 재추가, 9종 (기존 8종 + bloom)
ALTER TABLE public.books
  ADD CONSTRAINT books_source_platform_whitelist_chk
  CHECK (source_platform IN (
    'book_dash','gdl','librivox','pg','jybooks','wjjr','magic_light','african_storybook','bloom'
  ));
