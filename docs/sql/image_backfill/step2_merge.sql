-- 목적: 스테이징 → book_text.image_url 조인 UPDATE (ASb·Bloom 669권)
-- ADR: ADR-0057 D5-② · 검증 기준 D5-④
-- 적용: PM이 SQL Editor에 전체 붙여넣기 → Run
--
-- ############################################################################
-- ##  이 파일은 리허설이다 — 마지막 줄이 ROLLBACK; 이다.                    ##
-- ##  실제 반영은 마지막 줄을 COMMIT; 으로 **직접 고쳐** 다시 Run 해야 한다.##
-- ##                                                                        ##
-- ##  ADR-0053 E9 사고: 리허설 ROLLBACK을 COMMIT으로 오인해 적재 0건 상태로 ##
-- ##  다음 단계를 진행했다. SQL Editor는 **마지막 문장의 결과만** 보여준다. ##
-- ##  → 아래 (V6) verdict 한 줄이 화면에 남는다. 그 값으로만 판정할 것.     ##
-- ##  → 파일 안의 기대값 주석은 판정 근거가 아니다(E9 교훈).               ##
-- ############################################################################

begin;

-- (V0) 사전 상태 — UPDATE 전
select count(*) as rows_before,
       count(distinct book_id) as books_before,
       count(image_url) as not_null_before
  from public.book_text;
-- 기대: rows_before = 9496 · books_before = 860 · not_null_before = 2597

update public.book_text bt
   set image_url = s.image_url
  from public._img_backfill_staging s
  join public.books b
    on b.source_platform = s.source_platform
   and b.source_id       = s.source_id
 where bt.book_id    = b.id
   and bt.page_index = s.page_index;

-- (V1) 스테이징 행수
select count(*) as staging_rows from public._img_backfill_staging;
-- 기대: 6780

-- (V2) 스테이징 중 books 조인 실패(= 해당 source_id가 books에 없음)
select count(*) as unmatched_books
  from public._img_backfill_staging s
  where not exists (select 1 from public.books b
                     where b.source_platform = s.source_platform
                       and b.source_id = s.source_id);
-- 기대: 0

-- (V3) books는 있으나 대응 book_text 행이 없는 스테이징 행
--      (매니페스트가 적재 시점 이후 바뀌어 면 수가 달라진 경우 여기서 드러난다)
select count(*) as unmatched_pages
  from public._img_backfill_staging s
  join public.books b on b.source_platform = s.source_platform
                     and b.source_id = s.source_id
  where not exists (select 1 from public.book_text bt
                     where bt.book_id = b.id and bt.page_index = s.page_index);
-- 기대: 0

-- (V4) 총행수·권수 불변 + not_null 합계
select count(*) as rows_after,
       count(distinct book_id) as books_after,
       count(image_url) as not_null_after
  from public.book_text;
-- 기대: rows_after = 9496(불변) · books_after = 860(불변)
--       not_null_after = 2597 + 6780 = 9377

-- (V5) 절대 URL 불변식 (ADR-0057 D5-④ (d))
select count(*) as bad_url
  from public.book_text
 where image_url is not null and image_url not like 'http%';
-- 기대: 0

-- (V6) ★ 최종 판정 1행 — SQL Editor 화면에 남는 것은 이 결과다
select
  (select count(*) from public._img_backfill_staging)                                  as staging_rows,
  (select count(*) from public.book_text)                              as rows_after,
  (select count(image_url) from public.book_text)                      as not_null_after,
  (select count(*) from public.book_text
     where image_url is not null and image_url not like 'http%')       as bad_url,
  case when (select count(*) from public.book_text) = 9496
        and (select count(image_url) from public.book_text) = 9377
        and (select count(*) from public.book_text
               where image_url is not null and image_url not like 'http%') = 0
       then 'PASS' else 'FAIL' end                                     as verdict;
-- 기대: staging_rows=6780 · rows_after=9496 · not_null_after=9377
--       · bad_url=0 · verdict='PASS'   (내역: asb 5211 + bloom 1569 = 6780)

-- ############################################################################
-- ##  아래 한 줄. 리허설이면 ROLLBACK, 실제 반영이면 COMMIT 으로 고쳐 Run.  ##
-- ############################################################################
rollback;
