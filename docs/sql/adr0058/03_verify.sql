-- =============================================================================
-- 03_verify.sql — ADR-0058 실행 1단계 사후 검증 (쓰기문 0건 · 전부 SELECT)
--
-- 근거 ADR: ADR-0058 D2(제약 5상태) · D5(708권 시드)
-- 실행자  : 팀장 (Supabase SQL Editor)
-- 실행 시점: 01_migration_009 COMMIT + 02_seed_708 COMMIT 을 모두 마친 뒤.
--
-- ★ SQL Editor는 **마지막 결과만** 표시한다. 아래 [V1]~[V6]은 각각
--   **해당 블록만 드래그 선택해 하나씩 실행**할 것.
-- ★ 반복 실행해도 안전하다(쓰기문 0건). 트랜잭션 없음 — BEGIN/ROLLBACK 불필요.
-- =============================================================================


-- =============================================================================
-- [V1] CHECK 제약 값 목록 확인 (ADR-0058 D2)
-- 기대: constraint_name = book_review_status_check
--       definition 에 draft / in_review / confirmed / tts_requested / tts_done 5개
--       verdict = 'PASS'
-- =============================================================================
SELECT
  c.conname                   AS constraint_name,
  pg_get_constraintdef(c.oid) AS definition,
  CASE WHEN pg_get_constraintdef(c.oid) LIKE '%tts_requested%'
       THEN 'PASS — 5상태 제약 적용됨'
       ELSE 'FAIL — 01_migration_009 가 COMMIT 되지 않았다'
  END                         AS verdict
  FROM pg_constraint c
 WHERE c.conrelid = 'public.book_review'::regclass
   AND c.contype  = 'c'
 ORDER BY c.conname;


-- =============================================================================
-- [V2] status 분포 (ADR-0058 D5)
-- 기대: 총합 860. draft 가 크게 늘어 있다(기존 draft + 신규 708).
--       tts_requested 0행(화면 기능 미배포 상태이므로 정상).
-- =============================================================================
SELECT status, count(*) AS books
  FROM public.book_review
 GROUP BY status
 ORDER BY status;


-- =============================================================================
-- [V3] source_platform × status 교차 분포 (코호트 분리 확인 — ADR-0058 D5)
-- 기대:
--   african_storybook  draft 527
--   bloom              draft 142
--   book_dash          (기존 152권의 상태 분포) + draft 39
--   ─────────────────────────────
--   총합 860
-- =============================================================================
SELECT b.source_platform,
       r.status,
       count(*) AS books
  FROM public.book_review r
  JOIN public.books b ON b.id = r.book_id
 GROUP BY b.source_platform, r.status
 ORDER BY b.source_platform, r.status;


-- =============================================================================
-- [V4] book_text 보유 대비 book_review 결손 (기대: 0행 / missing = 0)
-- 시드의 정의 자체를 재확인하는 불변식이다.
-- =============================================================================
SELECT
  (SELECT count(DISTINCT book_id) FROM public.book_text)             AS books_with_text,
  (SELECT count(*) FROM public.book_review)                          AS review_rows,
  (SELECT count(DISTINCT bt.book_id) FROM public.book_text bt
    WHERE NOT EXISTS (SELECT 1 FROM public.book_review r
                       WHERE r.book_id = bt.book_id))                AS missing_review,
  CASE WHEN (SELECT count(DISTINCT bt.book_id) FROM public.book_text bt
              WHERE NOT EXISTS (SELECT 1 FROM public.book_review r
                                 WHERE r.book_id = bt.book_id)) = 0
       THEN 'PASS — 결손 0'
       ELSE 'FAIL — 02_seed_708 재실행 필요'
  END                                                                AS verdict;


-- =============================================================================
-- [V5] 역방향 확인 — book_review 는 있는데 book_text 가 없는 책 (기대: 0행)
-- 시드가 book_text 기준이므로 원칙적으로 0이어야 한다. 0이 아니면 과거 수기 행이
-- 있다는 뜻이므로 워커에게 전달할 것.
-- =============================================================================
SELECT b.source_platform, b.source_id, b.title, r.status
  FROM public.book_review r
  JOIN public.books b ON b.id = r.book_id
 WHERE NOT EXISTS (SELECT 1 FROM public.book_text t WHERE t.book_id = r.book_id)
 ORDER BY b.source_platform, b.source_id;


-- =============================================================================
-- [V6] 제외 확인 — Ruth 전용 10권이 시드되지 않았는가 (ADR-0058 D5)
-- 대상: book_dash · book_audio 보유 · book_text 0행
-- 기대: 10행이 나오고, seeded 컬럼이 전부 false.
--       (book_text 0행이라 구조적으로 제외된다 — 예외 처리 없음)
-- =============================================================================
SELECT b.source_id,
       b.title,
       b.is_active,
       EXISTS (SELECT 1 FROM public.book_review r WHERE r.book_id = b.id) AS seeded
  FROM public.books b
 WHERE b.source_platform = 'book_dash'
   AND EXISTS     (SELECT 1 FROM public.book_audio a WHERE a.book_id = b.id)
   AND NOT EXISTS (SELECT 1 FROM public.book_text  t WHERE t.book_id = b.id)
 ORDER BY b.source_id;
