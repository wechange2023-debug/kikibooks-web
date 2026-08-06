-- 중복 도서 비활성화 · step3 검증
-- 생성: scratchpad/dedup/finalize_deactivation.py (Claude Code)
-- A그룹(확정 131) 유지판 1권: ① 오디오 → ② book_dash → ④ 비-GDL → ③ 해상도 → ⑤ id 최소
-- B그룹(의심 35) 오디오·book_dash 판만 유지, 그 외 전원 비활성화
-- 실행: 팀장 전속. 반드시 step1 → step2 → step3 순서로 실행할 것
-- 대상: 총 166그룹 중 비활성화 231권 (유지 131권)
-- DELETE 없음. books 스키마 변경 없음. 트리거 무접촉

-- 검증 1) 비활성화 건수 (기대값: 231)
SELECT count(*) AS deactivated_count FROM books
WHERE is_active = FALSE AND id IN (SELECT id FROM books_backup_dedup_20260806);

-- 검증 2) 활성 잔여 총수 (기대값: 1852 - 231 = 1621)
SELECT count(*) AS active_total FROM books WHERE is_active = TRUE;

-- 검증 3) 오디오 보유 도서 전원 활성 확인 (기대값: 0행)
SELECT b.id, b.title, b.source_platform
FROM books b
WHERE b.is_active = FALSE
  AND EXISTS (SELECT 1 FROM book_audio a WHERE a.book_id = b.id);

-- 검증 4) book_dash 활성 권수 불변 확인 (기대값: 190)
SELECT count(*) AS active_book_dash FROM books
WHERE is_active = TRUE AND source_platform = 'book_dash';
