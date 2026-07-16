-- 목적: book_text.source 컬럼의 기본값 제거 (fail-closed — source 누락 INSERT를 즉시 거부)
-- ADR: ADR-0048 (D2)
-- 적용일: (PM이 SQL Editor 실행 시 기입)
-- 적용: PM이 Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run
-- ★실행 순서: 본 007 → step9_book_text_insert_{1..4}of4.sql → step10_book_review_seed.sql
-- 주의:
--   - book_text.source의 not null 제약은 유지. 기본값('pdf_harvest_v1')만 제거.
--   - 006에서 부여한 기본값은 실제 산출 체인(out_fixed_154, v2_orderfix)을 가리키지 않는다(ADR-0048 D1).
--     기본값을 없애면 source를 빠뜨린 INSERT가 not null 위반으로 즉시 실패한다(ADR-0048 D2).
--   - 영향 없음: book_text 0행, 앱 코드에 book_text 쓰기 경로 없음. 재실행 안전(drop default 멱등).
--   - 되돌리기: alter table public.book_text alter column source set default 'pdf_harvest_v1';

alter table public.book_text alter column source drop default;

-- =============================================================================
-- 검증 쿼리 (실행은 PM 몫 — 아래 주석 해제 후 SQL Editor에서 확인)
-- =============================================================================
-- 기대: column_default 가 NULL, is_nullable = 'NO'
-- select column_name, column_default, is_nullable from information_schema.columns
--   where table_schema='public' and table_name='book_text' and column_name='source';

-- =============================================================================
-- 끝. 다음 마이그레이션은 008_<목적>.sql 형식으로 작성.
-- =============================================================================
