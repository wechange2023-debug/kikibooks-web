-- =============================================================================
-- 02_seed_708_book_review.sql
-- 목적: book_text를 보유했으나 book_review 행이 없는 신규 708권에
--       book_review(status='draft') 1:1 행을 시드한다.
--
-- 근거 ADR: ADR-0058 D5(O5 흡수 — 신규 708권 시드) — Accepted 2026-08-13
--           ADR-0048 D4(적재와 동시 draft 시드) 동형 · ADR-0046 D6(status 4단계 원안)
--           ADR-0056 O5(미시드로 검수 목록 미노출) → 본 SQL 실행으로 종결
-- 원본  : scratchpad/step10_book_review_seed.sql (152권 시드) — 동일 구문 재사용
-- 실행자: 팀장 (Supabase SQL Editor). 워커 DB 직접 쓰기 금지(ADR-0053 D6-①).
--
-- ★ BEGIN … ROLLBACK 리허설이다. 기대값이 맞으면 맨 끝 `ROLLBACK;` 을
--   `COMMIT;` 으로 직접 고쳐 재실행할 것 (ADR-0053 E9 규약).
-- ★ SQL Editor는 마지막 결과만 표시한다. [선검증] 블록은 따로 드래그 실행할 것.
-- ★ 실행 순서: **01_migration_009 를 COMMIT 한 뒤** 본 파일을 실행한다.
--   (본 SQL은 'draft'만 넣으므로 01 이전에도 제약 위반은 없지만, 순서를 고정한다.)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 대상 산출 방식 — 명단을 박지 않는다
-- ─────────────────────────────────────────────────────────────────────────────
--   대상 = "book_text 행을 가진 책 전부" − "이미 book_review 행이 있는 책"
--   step10과 동일하게 book_text를 기준으로 삼는다. source_id 목록을 SQL에 박지
--   않으므로 명단 오류의 여지가 없다.
--
--   ※ Book Dash html **비활성 10권**(원본 이미지 404 블랙리스트, voice='Ruth' 전용)은
--     **book_text 0행**이므로 위 SELECT에 **구조적으로 포함되지 않는다**.
--     예외 처리·제외 목록이 필요 없다. (2026-08-13 워커 로컬 대조 확정:
--     lib/shared/blacklist.ts 10/10 등재 · scratchpad/step8_book_audio_insert.sql 10/10 등장 ·
--     out/audio_full708 및 docs/sql/load708 0/10 · ADR-0056 §Context 5-b "비활성 10권 121면")
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 기대 수치 (문서 기준 — 실측 확정은 아래 [선검증] 출력으로 한다)
-- ─────────────────────────────────────────────────────────────────────────────
--   시드 전 book_review        152권 (Book Dash PDF 코호트, ADR-0048 D4 · ADR-0051 Context)
--   book_text 보유             860권 = 152(BD PDF, ADR-0051 2,128행) + 708(ADR-0056 7,368행)
--   신규 시드                 +708권 = african_storybook 527 + bloom 142 + book_dash html 39
--   시드 후 book_review        860권
--
--   시드 후 source_platform 분포 기대:
--     african_storybook  527   (전량 신규 draft)
--     bloom              142   (전량 신규 draft)
--     book_dash          191   = 기존 152 + 신규 39
--     ─────────────────────────
--     합계               860
--
--   ※ 위 152·860은 **문서 기준값**이다. 선검증 (a)(b) 실측이 다르면 COMMIT 하지 말고
--     수치를 워커에게 전달할 것(ADR-0053 E9 — 판정은 실측 COUNT로만).
--
-- 되돌리기(COMMIT 후): 본 시드로 생긴 행만 삭제
--   DELETE FROM public.book_review r
--    WHERE r.status = 'draft'
--      AND EXISTS (SELECT 1 FROM public.books b
--                   WHERE b.id = r.book_id
--                     AND b.source_platform IN ('african_storybook','bloom'));
--   -- book_dash 신규 39권은 기존 152권과 같은 플랫폼이라 위 문장으로 구분되지 않는다.
--   -- 되돌릴 필요가 생기면 워커에게 39권 book_id 목록 생성을 요청할 것.
-- =============================================================================


-- =============================================================================
-- [선검증] — 이 블록만 먼저 개별 실행할 것 (읽기 전용)
-- =============================================================================

-- (a) 시드 전 book_review 총 행수 (기대 152)
SELECT count(*) AS review_rows_before FROM public.book_review;

-- (b) 시드 대상 권수 = book_text 보유 − book_review 보유 (기대 708)
SELECT count(DISTINCT bt.book_id) AS seed_targets
  FROM public.book_text bt
 WHERE NOT EXISTS (
   SELECT 1 FROM public.book_review r WHERE r.book_id = bt.book_id
 );

-- (c) 시드 대상의 플랫폼 분포 (기대: african_storybook 527 / bloom 142 / book_dash 39)
SELECT b.source_platform, count(DISTINCT bt.book_id) AS books
  FROM public.book_text bt
  JOIN public.books b ON b.id = bt.book_id
 WHERE NOT EXISTS (
   SELECT 1 FROM public.book_review r WHERE r.book_id = bt.book_id
 )
 GROUP BY b.source_platform
 ORDER BY b.source_platform;

-- (d) 시드 전 플랫폼 × status 분포 (기대: book_dash 152행뿐)
SELECT b.source_platform, r.status, count(*) AS books
  FROM public.book_review r
  JOIN public.books b ON b.id = r.book_id
 GROUP BY b.source_platform, r.status
 ORDER BY b.source_platform, r.status;

-- (e) 제외 확인 — book_text 0행인 book_dash 오디오 보유 책(= Ruth 전용 10권 등)
--     기대: 이 책들은 (b)(c)에 포함되지 않는다. 참고용 목록.
SELECT b.source_id, b.title, b.is_active
  FROM public.books b
 WHERE b.source_platform = 'book_dash'
   AND EXISTS (SELECT 1 FROM public.book_audio a WHERE a.book_id = b.id)
   AND NOT EXISTS (SELECT 1 FROM public.book_text t WHERE t.book_id = b.id)
 ORDER BY b.source_id;


-- =============================================================================
-- [본체] — 여기부터 끝까지 통째로 실행
-- =============================================================================
BEGIN;

-- 1) 시드 — step10_book_review_seed.sql 과 동일 구문.
--    ON CONFLICT (book_id) DO NOTHING → 기존 152권은 무접촉, 재실행 안전.
INSERT INTO public.book_review (book_id, status)
SELECT DISTINCT bt.book_id, 'draft'
  FROM public.book_text bt
ON CONFLICT (book_id) DO NOTHING;

-- 2) 구조 불변식 게이트 (fail-closed)
--    "book_text를 가진 책은 전부 book_review 행을 갖는다"가 시드의 정의다.
--    이게 깨지면 시드가 불완전한 것이므로 즉시 중단한다.
DO $$
DECLARE
  v_missing int;
BEGIN
  SELECT count(DISTINCT bt.book_id) INTO v_missing
    FROM public.book_text bt
   WHERE NOT EXISTS (SELECT 1 FROM public.book_review r WHERE r.book_id = bt.book_id);

  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'STOP: 시드 후에도 book_review 결손 %권 — 워커에게 전달할 것', v_missing;
  END IF;
  RAISE NOTICE '[게이트] book_review 결손 0 확인';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- [후검증] 마지막 SELECT만 SQL Editor에 표시된다.
-- 기대: review_rows_after 860 / missing_after 0 / asb 527 / bloom 142 / book_dash 191
--       verdict = 'PASS …'
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.book_review)                       AS review_rows_after,
  (SELECT count(DISTINCT bt.book_id) FROM public.book_text bt
    WHERE NOT EXISTS (SELECT 1 FROM public.book_review r
                       WHERE r.book_id = bt.book_id))             AS missing_after,
  (SELECT count(*) FROM public.book_review r JOIN public.books b ON b.id = r.book_id
    WHERE b.source_platform = 'african_storybook')                AS asb_books,
  (SELECT count(*) FROM public.book_review r JOIN public.books b ON b.id = r.book_id
    WHERE b.source_platform = 'bloom')                            AS bloom_books,
  (SELECT count(*) FROM public.book_review r JOIN public.books b ON b.id = r.book_id
    WHERE b.source_platform = 'book_dash')                        AS book_dash_books,
  CASE
    WHEN (SELECT count(*) FROM public.book_review) = 860
     AND (SELECT count(DISTINCT bt.book_id) FROM public.book_text bt
           WHERE NOT EXISTS (SELECT 1 FROM public.book_review r
                              WHERE r.book_id = bt.book_id)) = 0
    THEN 'PASS — 기대치 일치. ROLLBACK을 COMMIT으로 고쳐 재실행할 것'
    ELSE 'CHECK — 결손 0이면 시드 자체는 성공. 총계가 860이 아니면 수치를 워커에게 전달할 것'
  END                                                             AS verdict;

-- ⚠ 위 DO 블록에서 'STOP:' 예외가 나면 이후 문장이 'current transaction is aborted'로
--   실패한다 — 정상이다. **맨 처음 뜬 STOP 메시지만** 전달하면 된다.

ROLLBACK;   -- ← 기대값 일치 시 COMMIT 으로 고쳐 재실행 (ADR-0053 E9 규약)
