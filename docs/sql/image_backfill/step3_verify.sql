-- 목적: COMMIT 후 최종 검증 (ADR-0057 D5-④)
-- ADR: ADR-0057 D5-④ (a)(b)(c)(d)
-- 적용: step2_merge를 COMMIT으로 실행한 뒤 본 파일을 Run
-- 주의:
--   - 읽기 전용. UPDATE·DELETE 0건.
--   - ★ (c)는 총계가 아니라 **배분**을 본다. 총계만 맞고 배분이 틀린 상태를
--     통과시키지 않는다(ADR-0056 §5-c · ADR-0057 D5-④ (c)).

-- (a) 행수·권수 불변
select count(*) as total_rows, count(distinct book_id) as total_books
  from public.book_text;
-- 기대: total_rows = 9496 · total_books = 860

-- (b) 플랫폼별 not_null 분포
select b.source_platform,
       count(*)                as rows,
       count(bt.image_url)     as not_null,
       count(*) - count(bt.image_url) as nulls
  from public.book_text bt
  join public.books b on b.id = bt.book_id
 group by b.source_platform
 order by b.source_platform;
-- 기대: book_dash not_null = 2597 / nulls = 0
--       african_storybook not_null = 5211
--       bloom not_null = 1569
--       전체 not_null = 9377 · 전체 nulls = 119

-- (c) ★ NULL 배분 대조 — 드라이런 리포트의 '이미지<텍스트' 행수와 일치해야 한다
select b.source_platform, b.source_id, count(*) as null_pages
  from public.book_text bt
  join public.books b on b.id = bt.book_id
 where bt.image_url is null
 group by b.source_platform, b.source_id
 order by null_pages desc, b.source_platform, b.source_id;
-- 기대: 합계 119행. 권별 값이 out/per_book.csv 의 missing 열과 1:1 일치.
--       (드라이런 실측: 이미지<텍스트 면 합계 = 119행 + fetch 실패권 전 면)

-- (d) 절대 URL 불변식
select count(*) as bad_url
  from public.book_text
 where image_url is not null and image_url not like 'http%';
-- 기대: 0

-- (e) 표본 육안 확인 — 플랫폼별 3건씩 URL 형태 확인
select b.source_platform, b.source_id, bt.page_index, bt.image_url
  from public.book_text bt
  join public.books b on b.id = bt.book_id
 where bt.image_url is not null
   and b.source_platform in ('african_storybook','bloom')
 order by b.source_platform, b.source_id, bt.page_index
 limit 6;
-- 기대: african_storybook → https://africanstorybook.org/...
--       bloom             → https://s3.amazonaws.com/bloomharvest/...
