-- step4d_fix_sima_credit.sql — sima-and-siza 저작자 표시 오타 교정 (author + attribution_text)
-- 실행: 팀장(Supabase SQL Editor). 워커는 초안만 제시(DB 직접 쓰기 금지).
-- (기존 step4d_fix_sima_author.sql 대체 — author 뿐 아니라 화면 표시 attribution_text 까지 포함)
--
-- 배경:
--   Book Dash 원본 meta.yml creator 자체가 오타 "CClaire Ingram"(앞 C 중복).
--   이 오타가 books.author 와 books.attribution_text(화면 표시 CC BY 저작자 표시) 양쪽에 승계됨.
--   원본 자체 오타이므로 CC BY 저작자 표시를 바로잡는 예외 교정(팀장 결정 2026-07-07, 표시교정 B안).
--
-- 대상 특정 (가정 금지 — DB 동작으로 실증):
--   source_platform = 'book_dash'
--   source_id       = '9c9ea96c-fe46-11e5-86aa-5e5517507c66'  (UUID)
--   근거: 원본 커버 이관 step3_update_cover_url.sql 가 이 UUID 를 VALUES 로 두고
--         `b.source_id = v.source_id` 조인으로 sima 를 성공 이관함(sima 는 '미이관 잔여 3권'에 없음).
--         UUID 조인이 sima 를 매칭했다는 것 자체가 books.source_id[sima] = 이 UUID 임을 증명.
--   ※ book_dash 중 극소수(little-sock/maddy-moona/mrs-penguins 3권)만 source_id 가 full-slug 이고,
--     sima 는 거기에 해당하지 않음(UUID 정상 키).
--   ※ synced_at 등 시간 조건 사용 금지(타임존 0건 함정 회피). source_platform+source_id 로만 특정.
--   ※ [선검증]이 1행을 돌려주는지로 키 정확성을 눈으로 확인한 뒤 UPDATE 실행.
--
-- 범위: author, attribution_text 두 컬럼만. 다른 컬럼·다른 책 무접촉. 'CClaire' → 'Claire' 치환만.

-- ── [선검증] 기대: 1행, author/attribution_text 에 "CClaire" 포함 ──────────────
SELECT id, source_platform, source_id, title, author, attribution_text
FROM books
WHERE source_platform = 'book_dash'
  AND source_id = '9c9ea96c-fe46-11e5-86aa-5e5517507c66';

-- ── [UPDATE-1] author: "CClaire" → "Claire" (해당 토큰만 치환) ────────────────
UPDATE books
SET author = REPLACE(author, 'CClaire', 'Claire')
WHERE source_platform = 'book_dash'
  AND source_id = '9c9ea96c-fe46-11e5-86aa-5e5517507c66'
  AND author LIKE '%CClaire%';

-- ── [UPDATE-2] attribution_text: "CClaire" → "Claire" (해당 토큰만 치환) ───────
UPDATE books
SET attribution_text = REPLACE(attribution_text, 'CClaire', 'Claire')
WHERE source_platform = 'book_dash'
  AND source_id = '9c9ea96c-fe46-11e5-86aa-5e5517507c66'
  AND attribution_text LIKE '%CClaire%';

-- ── [후검증] 기대: 1행, author/attribution_text 모두 "Claire"(CClaire 없음) ────
SELECT id, source_platform, source_id, title, author, attribution_text
FROM books
WHERE source_platform = 'book_dash'
  AND source_id = '9c9ea96c-fe46-11e5-86aa-5e5517507c66';
