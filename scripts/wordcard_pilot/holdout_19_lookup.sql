-- =============================================================================
-- 단어카드 제외 판정 · 보류 19건 원문 확인 (지시서 E-2c-3 STEP 1)
--
-- ★ SELECT 전용. INSERT/UPDATE/DELETE/DDL 0건. 트랜잭션 불필요.
--
-- 대상: scripts/wordcard_pilot/out/exclusion_candidates.tsv 의 "보류" 32건 중
--       ⑤경계 13건(팀장 유지 확정)을 뺀 19건.
-- 방식: 각 단어가 실린 책은 전부 1권뿐이므로 book_id로 못박아 조회한다
--       (전체 book_text 스캔 없음 — 19권 × 페이지 수만 읽는다).
-- 단어 경계: ILIKE '% w %' 는 줄 첫/끝·문장부호 인접을 놓친다.
--            정규식 `\y`(워드 바운더리)로 잡는다. 대소문자 무시는 `~*`.
--
-- 스키마 근거:
--   supabase/migrations/006_review_data_model.sql:13-23  (book_text 본체 · text 열)
--   supabase/migrations/008_book_text_image_url.sql:21   (image_url 추가)
--
-- 실행: Supabase SQL Editor에 그대로 붙여넣고 Run. 결과 전체를 워커에게 회신.
-- =============================================================================

with target(word, book_id) as (
  values
    ('awe',      '0d62a11f-2aef-4159-9a3c-2572d82b1778'::uuid),  -- Don't Cry, My Child
    ('bajaj',    '02734256-6c7c-4762-98ed-39abdb492567'::uuid),  -- Abebech, the female bajaj driver
    ('bathtime', 'e50bd660-92c8-4938-b342-b43409bdb99f'::uuid),  -- Bathtub Safari
    ('birdy',    'aa1ec813-f9b6-4eda-a28d-2b9d3517f191'::uuid),  -- Small Bird's Big Adventure
    ('dazy',     'd0d91447-ade9-40cf-b536-9d40851a58b0'::uuid),  -- The man that could...
    ('erotot',   '6dd77423-b093-4495-aa83-f322f89a472b'::uuid),  -- Child As a Peacemaker
    ('goo',      '27c84efc-f68a-4a76-bef1-17acfbcc5a19'::uuid),  -- How About You?
    ('inswa',    '8cc51dc0-1fda-4dec-b0e1-93f760d0eb74'::uuid),  -- The New Road
    ('kolo',     'bed71171-64fe-4339-8404-1ac8bff35def'::uuid),  -- The Girl Who Played
    ('oakum',    '2ba62d91-9022-4378-a8a9-5bc4f62ab718'::uuid),  -- Feathered Friends
    ('popcorns', 'b36b8e92-29ed-412a-9cd2-babc65a078a9'::uuid),  -- SAM POPCORNS
    ('pute',     '741f9a46-2703-4181-83ff-30d63ab1e109'::uuid),  -- The wrong cereal.
    ('recces',   '7d620dcf-c174-4a9e-ad0d-53916b8cc9fc'::uuid),  -- A New School
    ('siko',     '0c168687-22e0-4c0c-bb97-55d7d3c1874f'::uuid),  -- The Hungry Green Frog
    ('susu',     'eeb6be8c-658b-456a-86ce-670d5fba336f'::uuid),  -- It's MY book!
    ('tinny',    '0d5c90ad-cd47-46e1-a80a-2ba005b3c73b'::uuid),  -- Whose button is this?
    ('tipite',   'f874036e-6156-4be9-8df1-b50361981241'::uuid),  -- Animals Dig a Well
    ('tsi',      '54059ca0-6e7a-43e6-8c38-feaa419d2267'::uuid),  -- Pumpkins?
    ('twangale', 'da1d32b6-453a-4d14-9cc1-e808fb1b9589'::uuid)   -- O Rain Come
),
hit as (
  select
    t.word,
    bt.page_index,
    left(regexp_replace(bt.text, '\s+', ' ', 'g'), 300) as passage,
    row_number() over (partition by t.word order by bt.page_index) as rn
  from target t
  join public.book_text bt on bt.book_id = t.book_id
  where bt.text ~* ('\y' || t.word || '\y')
)
select word, page_index, passage
from hit
where rn <= 2

union all

-- 한 페이지도 안 걸린 단어를 드러낸다(정규식·적재 문제 조기 발견용).
select t.word, null::int, '(원문에서 매치 0건)'
from target t
where not exists (select 1 from hit h where h.word = t.word)

order by word, page_index;
