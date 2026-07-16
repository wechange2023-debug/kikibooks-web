-- 목적: book_text 적재된 152권에 book_review(status='draft') 1:1 시드 (검수 진척 측정 기반)
-- 실행자: 팀장(Supabase SQL Editor). 워커 초안. DB 직접 쓰기 금지.
-- 근거 ADR: ADR-0046 D6(검수 status 4단계), ADR-0048 D4(적재와 동시 draft 시드)
-- ★실행 순서: 007_book_text_source_default.sql → step9_book_text_insert_{1..4}of4.sql → 본 파일
-- 주의: book_text 적재 완료 후 실행. ON CONFLICT(book_id) DO NOTHING → 재실행 안전.
--   되돌리기: DELETE FROM book_review WHERE status='draft';  (ADR-0048 D4)

-- ───────── [선검증] ─────────
-- book_review 적재 전 행 수 (기대 0)
SELECT count(*) AS review_rows_before FROM book_review;
-- book_text 적재 완료 확인 (기대 152 — step9 4파일 실행 후여야 함)
SELECT count(DISTINCT book_id) AS books_with_text FROM book_text;

-- ───────── [적재] ─────────
BEGIN;
INSERT INTO book_review (book_id, status)
SELECT DISTINCT bt.book_id, 'draft'
  FROM book_text bt
ON CONFLICT (book_id) DO NOTHING;
COMMIT;

-- ───────── [후검증] ─────────
-- 기대: draft 152행 (status 전부 draft)
SELECT status, count(*) FROM book_review GROUP BY status;
