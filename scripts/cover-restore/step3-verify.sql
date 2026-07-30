-- ============================================================================
-- STEP 3 — 화면 검증 후 최종 확인 (3단계 2차 분할본, 2026-07-30)
-- 서비스 화면에서 ASb 표지 노출을 육안 확인한 뒤 실행한다.
-- ============================================================================

-- 1) 갱신 총수 — 745 이어야 함
SELECT COUNT(*) AS updated_total
FROM books
WHERE cover_url LIKE '%/storage/v1/object/public/book-covers/asb-%';

-- 2) 백업 총수 — 745 이어야 함
SELECT COUNT(*) AS backup_count FROM cover_url_backup_20260730;

-- 3) 표본 5건 재확인 (old → new)
SELECT b.id, b.title, bk.cover_url AS old_url, b.cover_url AS new_url
FROM books b JOIN cover_url_backup_20260730 bk ON bk.id = b.id
LIMIT 5;

-- 4) ASb 활성 도서 중 아직 외부 covers/ 경로가 남은 책 — 0 이어야 함
--    (대상 745권 밖의 ASb 책은 원래 정상 표지라 africanstorybook.org URL이어도 정상.
--     이 검증은 '깨졌던 745권'이 전부 전환됐는지를 백업 테이블 기준으로 본다)
SELECT COUNT(*) AS not_migrated
FROM books b JOIN cover_url_backup_20260730 bk ON bk.id = b.id
WHERE b.cover_url NOT LIKE '%/book-covers/asb-%';
