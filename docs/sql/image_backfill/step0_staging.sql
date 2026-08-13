-- 목적: ASb·Bloom 이미지 URL 백필용 임시 스테이징 테이블 생성
-- ADR: ADR-0057 D5-②
-- 적용: PM이 Supabase Dashboard → SQL Editor에 붙여넣기 → Run
-- ★실행 순서: 본 step0 → chunk_01..NN → step2_merge(리허설→COMMIT) → step3_verify → step4_drop
-- 주의:
--   - 임시 테이블이다. step4_drop.sql로 반드시 지운다(ADR-0053 Amd#4 staging 선례).
--   - RLS 미설정 = service_role/SQL Editor 전용. 앱 코드는 이 테이블을 모른다.
--   - 재실행 안전(create table if not exists).
--   - 원복: drop table if exists public._img_backfill_staging;

create table if not exists public._img_backfill_staging (
  source_platform text not null,
  source_id       text not null,
  page_index      int  not null,
  image_url       text not null
);

create index if not exists _img_backfill_staging_src_idx
  on public._img_backfill_staging (source_platform, source_id);

-- 기대: 0행 (신규 생성 직후). 재실행 시 이전 행이 남아 있으면 먼저 truncate 한다.
select count(*) as staging_rows from public._img_backfill_staging;
-- truncate public._img_backfill_staging;   -- 필요 시 주석 해제
