-- step3c_update_remaining3.sql — Book Dash STEP 3 잔여 3권 cover_url 이관 (ADR-0032) [최종본]
-- 실행: 팀장(Supabase SQL Editor). DB executed 2026-07-04 by 팀장, 검증 209 storage / 0 기타 확인.
--
-- 창고 실물 확인 완료(step3s_check_storage.py, 읽기전용):
--   book-covers 버킷 3권 모두 존재 확인. 단, 파일명은 orchestrator 신규 id 가 아니라
--   manifest target_key(옛 book_dash UUID) 기준으로 실재한다.
--     new-id 파일명(bookdash-{8ecad49e…}.webp 등) → 창고에 '없음'(3/3)
--     old-uuid 파일명(bookdash-{9c9…}.webp)       → 창고에 '있음'(3/3)  ← 실물
--   따라서 SET cover_url 은 실존하는 old-uuid 기반 URL 로 고정한다(신규 id URL 은 404).
--
-- 키 정리:
--   WHERE 키(DB source_id)  = slug (확정 매핑)
--   URL  키(창고 파일명)      = old book_dash UUID (실물 존재)
--   slug → old-uuid:
--     little-sock-and-the-tiny-creatures → 9c9f4da4-fe46-11e5-86aa-5e5517507c66
--     maddy-moonas-menagerie             → 9c9e7dca-fe46-11e5-86aa-5e5517507c66
--     mrs-penguins-perfect-palace        → 9c9eb7e0-fe46-11e5-86aa-5e5517507c66
--   URL 표기: step3_update_cover_url.sql 과 동일하게 전체 URL 하드코딩(기존 산출물 관례).

-- [선검증] 기대: 3 (아직 github.io 인 3권)
SELECT COUNT(*) AS remaining_github_io
FROM books
WHERE source_platform = 'book_dash'
  AND source_id IN (
    'little-sock-and-the-tiny-creatures',
    'maddy-moonas-menagerie',
    'mrs-penguins-perfect-palace'
  )
  AND cover_url LIKE '%bookdash.github.io%';

-- [본 업데이트] slug 키 · 실존 old-uuid Storage URL (3줄, 각 권 정확히 한정)
UPDATE books
SET cover_url = 'https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-9c9f4da4-fe46-11e5-86aa-5e5517507c66.webp'
WHERE source_platform = 'book_dash' AND source_id = 'little-sock-and-the-tiny-creatures';

UPDATE books
SET cover_url = 'https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-9c9e7dca-fe46-11e5-86aa-5e5517507c66.webp'
WHERE source_platform = 'book_dash' AND source_id = 'maddy-moonas-menagerie';

UPDATE books
SET cover_url = 'https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-9c9eb7e0-fe46-11e5-86aa-5e5517507c66.webp'
WHERE source_platform = 'book_dash' AND source_id = 'mrs-penguins-perfect-palace';

-- [후검증] 기대: 3
SELECT COUNT(*) AS migrated_now
FROM books
WHERE source_platform = 'book_dash'
  AND source_id IN (
    'little-sock-and-the-tiny-creatures',
    'maddy-moonas-menagerie',
    'mrs-penguins-perfect-palace'
  )
  AND cover_url LIKE '%/storage/v1/object/public/book-covers/%';

-- ─────────────────────────────────────────────────────────────────────────────
-- [롤백] 원복 시 아래 실행 — ⚠ 원주소 도메인 미확정(bookdash.org 계열): 아래 주소는
--   migration 직전 DB cover_url(manifest old_cover_url = bookdash.github.io) 기준이다.
--   실제 최초 원주소가 bookdash.org 계열일 수 있으니 롤백 시 도메인 재확인 필수.
-- UPDATE books SET cover_url = 'https://bookdash.github.io/bookdash-books/little-sock/en/images/cover.jpg'
--   WHERE source_platform='book_dash' AND source_id='little-sock-and-the-tiny-creatures';
-- UPDATE books SET cover_url = 'https://bookdash.github.io/bookdash-books/maddy-moona/en/images/cover.jpg'
--   WHERE source_platform='book_dash' AND source_id='maddy-moonas-menagerie';
-- UPDATE books SET cover_url = 'https://bookdash.github.io/bookdash-books/mrs-penguins-palace/en/images/cover.jpg'
--   WHERE source_platform='book_dash' AND source_id='mrs-penguins-perfect-palace';
