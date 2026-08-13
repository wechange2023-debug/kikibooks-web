-- 목적: 백필용 스테이징 테이블 삭제
-- ADR: ADR-0057 D5-②
-- 적용: ★ step3_verify가 전항 PASS 한 뒤에만 Run
-- 주의:
--   - step3가 FAIL이면 실행하지 말 것. 스테이징이 있어야 재머지가 가능하다
--     (ADR-0053 E9: staging을 먼저 지워 복구 경로를 잃은 선례).
--   - book_text 무접촉. 되돌리기는 step0 + chunk 재실행.

drop table if exists public._img_backfill_staging;

-- 기대: 0행 (테이블 소멸 확인)
select count(*) as staging_tables from information_schema.tables
 where table_schema = 'public' and table_name = '_img_backfill_staging';
