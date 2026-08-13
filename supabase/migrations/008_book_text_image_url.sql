-- 목적: book_text에 페이지 이미지 URL 컬럼 신설 (런타임 조립 폐기 — 플랫폼별 하드코딩 해소)
-- ADR: ADR-0057 (D1)
-- 적용일: (PM이 SQL Editor 실행 시 기입)
-- 적용: PM이 Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run
-- ★실행 순서: 본 008 → D5-① book_dash 191권 UPDATE → D5-② ASb·Bloom 669권 UPDATE
--             → (백필 완료 확인 후) D2·D3 코드 전환 배포
--             ※ 백필보다 코드 전환이 먼저 나가면 book_dash 191권까지 이미지가 사라진다.
-- 주의:
--   - 컬럼 1개 추가만. 기존 컬럼·제약·트리거·RLS 정책 미접촉.
--     (006 §2.5 book_text_touch_updated_at · §3.1 SELECT 정책 무변경)
--   - NULL 허용이 본질이다(ADR-0057 D1). "이미지가 없는 면"은 오류가 아니라 정상 상태이며
--     (ADR-0025 Amd#6 A3), ASb 코호트에서 실제로 발생한다.
--   - 저장 값은 그대로 <img src>에 넣을 수 있는 '완성된 절대 URL'이다(ADR-0057 D2).
--     상대 키·접두사 조각을 넣지 않는다. 검증은 D5-④ (d) image_url NOT LIKE 'http%' = 0행.
--   - books / book_audio / book_review 무접촉. attribution_text NOT NULL(Hard Rule 1)·
--     enforce_commercial_license(Hard Rule 2) 무관.
--   - 재실행 안전하지 않다: 이미 컬럼이 있으면 42701(column already exists)로 실패한다.
--     이는 fail-loud이며 데이터 영향이 없다. 재실행 전 아래 검증 쿼리 (a)로 존재를 확인한다.
--   - 원복: alter table public.book_text drop column image_url;

alter table public.book_text add column image_url text;

comment on column public.book_text.image_url is
  '페이지 이미지의 완성된 절대 URL. NULL = 이미지 없는 면(정상). book_dash는 Storage 공개 URL, ASb/Bloom은 원본 CDN URL. ADR-0057 D1·D2.';

-- =============================================================================
-- 검증 쿼리 (실행은 PM 몫 — 아래 주석 해제 후 SQL Editor에서 확인)
-- =============================================================================
-- (a) 컬럼 생성 확인 (기대: image_url / text / is_nullable = 'YES' 1행)
-- select column_name, data_type, is_nullable from information_schema.columns
--   where table_schema='public' and table_name='book_text' and column_name='image_url';

-- (b) 초기 상태 확인 (기대: 전 행 NULL — 백필 전이므로 not_null = 0)
-- select count(*) as total, count(image_url) as not_null from public.book_text;

-- (c) 기존 행 무손상 확인 (기대: 008 실행 전후 동일 — ADR-0057 D5-④ (a))
-- select count(*) as rows, count(distinct book_id) as books from public.book_text;

-- =============================================================================
-- 끝. 다음 마이그레이션은 009_<목적>.sql 형식으로 작성.
-- =============================================================================
