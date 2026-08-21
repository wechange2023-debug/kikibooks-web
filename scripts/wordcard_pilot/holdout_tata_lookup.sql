-- =============================================================================
-- 단어카드 제외 판정 · 5회전 수렴 후 남은 보류 1건 + 확인 요청 3건 (지시서 E-2c-4)
--
-- ★ SELECT 전용. INSERT/UPDATE/DELETE/DDL 0건.
--
-- 대상은 전부 한 권 — `Hello, baby!` (79c9051e-7b0b-460c-8195-74db2c2b11ae).
-- 다국어 인사말 그림책이라 5회전 내내 비영어 단어를 올린 책이다(22종 제외).
--
--   ① ta-ta  … **보류**. 영어 구어 작별 인사이기도 해서 이 책이 영어 항목으로
--                실은 것인지 다른 언어 항목인지 원문 없이는 못 가른다.
--                현재 제외 목록에 **넣지 않았다**(카드로 나온다).
--   ② sale   … 제외했으나 **영어 낱말(판매)과 철자가 같다.** 형제 카드가 전부
--                작별 인사라 코사어 "sale kakuhle"로 판정했다. 확인 요청.
--   ③ die    … 제외했으나 영어 동사와 철자가 같다. 아프리칸스어 정관사로 판정
--                ("Waar is die baba?"). 확인 요청.
--   ④ hallo  … 제외했으나 영국식 영어 변이 표기이기도 하다. 같은 책에 `hello`가
--                **따로** 카드로 있어 아프리칸스어 인사말로 판정했다. 확인 요청.
--
-- ※ ②③④는 어느 쪽으로 읽어도 카드 가치가 낮아 판정이 뒤집혀도 영향은 작지만,
--    새 책이 적재되면 영어 쪽 의미로 쓰이는 책이 생길 수 있어 근거를 남겨 둔다.
--
-- 스키마 근거: supabase/migrations/006_review_data_model.sql:13-23
--
-- 실행: Supabase SQL Editor에 붙여넣고 Run. 결과 전체를 워커에게 회신.
-- =============================================================================

with target(word, note) as (
  values
    ('ta-ta', '보류 — 제외 목록 미포함'),
    ('sale',  '확인 요청 — 제외 적용 중'),
    ('die',   '확인 요청 — 제외 적용 중'),
    ('hallo', '확인 요청 — 제외 적용 중')
)
select
  t.word,
  t.note,
  bt.page_index,
  left(regexp_replace(bt.text, '\s+', ' ', 'g'), 300) as passage
from target t
join public.book_text bt
  on bt.book_id = '79c9051e-7b0b-460c-8195-74db2c2b11ae'::uuid
 and bt.text ~* ('\y' || replace(t.word, '-', '[-]?') || '\y')
order by t.word, bt.page_index;

-- 위가 비면 이 책 전문을 그대로 본다(14면 이하라 부담 없다).
-- select page_index, left(regexp_replace(text, '\s+', ' ', 'g'), 300) as passage
-- from public.book_text
-- where book_id = '79c9051e-7b0b-460c-8195-74db2c2b11ae'::uuid
-- order by page_index;
