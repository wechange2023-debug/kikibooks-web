-- =============================================================================
-- 단어카드 한글 뜻 · `brains` 문맥 확정 (지시서 E-2c-9 STEP 2)
--
-- ★ SELECT 전용. INSERT/UPDATE/DELETE/DDL 0건.
--
-- 쟁점: `brains`가 **신체 기관(뇌)** 인가 **지능(똑똑함)** 인가.
--   현재 사전값은 '똑똑한 머리'(지능)이나, 실린 책은 한 권뿐이고
--   제목·형제 카드가 기관 쪽을 가리킨다:
--     책 제목 : Crocodile Waits For Brains
--     형제 카드: crocodile, river, young, ones, man, day, promised
--   `man`과 `promised`가 함께 있어 "사람이 뇌를 가져다주기로 약속했다"로 읽히지만,
--   제목만으로는 "악어가 지혜를 얻기를 기다린다"로도 읽힌다. 원문이 필요하다.
--
-- 참고: 같은 계열 `brain`(단수)은 확정됐다 — 책 `Kate is in heaven`의 형제 카드가
--   head·doctor·remove·cut이라 명백한 신체 기관이다(사전값 '뇌', 변경 없음).
--
-- 스키마 근거: supabase/migrations/006_review_data_model.sql:13-23
--
-- 실행: Supabase SQL Editor에 붙여넣고 Run. 결과 전체를 워커에게 회신.
-- =============================================================================

select
  bt.page_index,
  left(regexp_replace(bt.text, '\s+', ' ', 'g'), 300) as passage
from public.book_text bt
where bt.book_id = '93c51967-a4c7-4561-9841-26ee45e71c74'::uuid
order by bt.page_index;

-- ※ 위는 이 책 전문이다(그림책이라 14면 이하). `brains`가 나오는 면만 보려면
--    아래를 대신 실행한다.
--
-- select bt.page_index, left(regexp_replace(bt.text, '\s+', ' ', 'g'), 300) as passage
-- from public.book_text bt
-- where bt.book_id = '93c51967-a4c7-4561-9841-26ee45e71c74'::uuid
--   and bt.text ~* '\ybrains?\y'
-- order by bt.page_index;
