-- =============================================================================
-- 01_migration_009_tts_requested.sql
-- 목적: public.book_review.status CHECK 제약을 4상태 → 5상태로 교체한다.
--       ('draft','in_review','confirmed','tts_done')
--         → ('draft','in_review','confirmed','tts_requested','tts_done')
--
-- 근거 ADR: ADR-0058 D2(요청 상태 모델) · D3(전이표) — Accepted 2026-08-13
--           ADR-0046 D6(status 4단계 원안) / migration 006 §2
-- 실행자  : 팀장 (Supabase Dashboard → SQL Editor). 워커 DB 직접 쓰기 금지(ADR-0053 D6-①).
--
-- ★ 본 파일은 BEGIN … ROLLBACK 리허설이다. 기대값이 전부 맞으면 맨 끝의
--   `ROLLBACK;` 을 `COMMIT;` 으로 **직접 고쳐 타이핑**한 뒤 다시 실행할 것.
--   — ADR-0053 E9 사고(리허설 ROLLBACK을 COMMIT으로 오인) 재발 방지 규약.
--
-- ★ SQL Editor는 **마지막 결과만** 표시한다. [선검증] 블록은 아래 [본체]와 따로,
--   해당 줄만 드래그 선택해 먼저 실행할 것.
--
-- 무접촉 확인 (Hard Rule):
--   · books / book_audio / book_text 무접촉 → attribution_text NOT NULL(HR1),
--     enforce_commercial_license(HR2) 무관.
--   · 도메인 DDL은 book_review 1테이블의 CHECK 제약 1개 한정. 컬럼 추가·삭제 0건.
--   · RLS·정책 무변경(006 §3.2 — book_review는 정책 0개 = service_role 전용 유지).
--   · 기존 행의 status 값은 전부 새 집합의 부분집합이라 데이터 변경 0건.
--
-- 되돌리기(COMMIT 후):
--   1) UPDATE public.book_review SET status='confirmed' WHERE status='tts_requested';
--   2) 본 파일의 [본체]를 4상태 목록으로 바꿔 재실행.
-- =============================================================================


-- =============================================================================
-- [선검증] — 이 블록만 먼저 개별 실행할 것 (읽기 전용)
-- =============================================================================

-- (a) 현재 book_review의 CHECK 제약 이름·정의
--     기대: 1행. definition 에 draft/in_review/confirmed/tts_done 4개 값이 보인다.
--     ※ migration 006:35-36 의 CHECK는 **인라인 무명 제약**이라 이름은 Postgres
--       자동 생성명이다. 아래 [본체]는 이름을 하드코딩하지 않고 동적으로 찾아 지운다.
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.book_review'::regclass
   AND contype  = 'c'
 ORDER BY conname;

-- (b) 현재 status 분포 — 변경 전 기준선. 5번째 값(tts_requested)은 0행이어야 한다.
SELECT status, count(*) AS books
  FROM public.book_review
 GROUP BY status
 ORDER BY status;

-- (c) 새 집합 밖의 값이 있는지 (기대: 0행 — 있으면 제약 교체가 실패한다)
SELECT status, count(*) AS books
  FROM public.book_review
 WHERE status NOT IN ('draft','in_review','confirmed','tts_requested','tts_done')
 GROUP BY status;


-- =============================================================================
-- [본체] — 여기부터 끝까지 통째로 실행
-- =============================================================================
BEGIN;

-- 1) 기존 status CHECK 제약을 **이름을 찾아서** 삭제한다.
--    이름 추정 금지: 인라인 무명 제약이라 자동 생성명이며, 정확히 1개일 때만 진행한다.
--    1개가 아니면 STOP — 예상 밖 상황이므로 사람이 확인해야 한다(fail-closed).
DO $$
DECLARE
  v_name  text;
  v_count int;
BEGIN
  SELECT count(*), min(conname)
    INTO v_count, v_name
    FROM pg_constraint
   WHERE conrelid = 'public.book_review'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%status%';

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'STOP: book_review의 status CHECK 제약이 %개다(기대 1). 선검증 (a) 결과를 워커에게 전달할 것.',
      v_count;
  END IF;

  EXECUTE format('ALTER TABLE public.book_review DROP CONSTRAINT %I', v_name);
  RAISE NOTICE '[1/3] 기존 제약 삭제: %', v_name;
END $$;

-- 2) 5상태 CHECK 제약을 **명시적 이름**으로 재생성한다.
--    이후 개정에서 이름 추정이 필요 없도록 여기서 이름을 고정한다.
ALTER TABLE public.book_review
  ADD CONSTRAINT book_review_status_check
  CHECK (status IN ('draft','in_review','confirmed','tts_requested','tts_done'));

-- 3) 테이블 주석 갱신 (006:43-44 의 4단계 표기를 5단계로).
COMMENT ON TABLE public.book_review IS
  '책 단위 검수 상태. status 5단계(draft/in_review/confirmed/tts_requested/tts_done). '
  'tts_requested = 관리자 화면의 TTS 생성 요청(ADR-0058 D2), tts_done 전이는 로컬 파이프라인 소관(D6). '
  '공개는 books.is_active가 단일진실(ADR-0046 D6).';

-- ─────────────────────────────────────────────────────────────────────────────
-- [후검증] 변경 후 제약 확인 — 마지막 SELECT가 SQL Editor에 표시된다.
-- 기대: verdict = 'PASS …' / constraint_name = book_review_status_check /
--       definition 에 5개 값이 모두 보인다.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  c.conname                                  AS constraint_name,
  pg_get_constraintdef(c.oid)                AS definition,
  (SELECT count(*) FROM public.book_review)  AS review_rows_unchanged,
  CASE
    WHEN pg_get_constraintdef(c.oid) LIKE '%tts_requested%'
     AND pg_get_constraintdef(c.oid) LIKE '%tts_done%'
     AND pg_get_constraintdef(c.oid) LIKE '%confirmed%'
     AND pg_get_constraintdef(c.oid) LIKE '%in_review%'
     AND pg_get_constraintdef(c.oid) LIKE '%draft%'
    THEN 'PASS — 5상태 제약 확인. ROLLBACK을 COMMIT으로 고쳐 재실행할 것'
    ELSE 'FAIL — definition을 워커에게 전달할 것'
  END                                        AS verdict
  FROM pg_constraint c
 WHERE c.conrelid = 'public.book_review'::regclass
   AND c.conname  = 'book_review_status_check';

-- ⚠ 위 DO 블록에서 'STOP:' 예외가 나면 이후 문장들이
--   'current transaction is aborted' 로 줄줄이 실패한다 — 정상이다.
--   **맨 처음 뜬 STOP 메시지만** 워커에게 전달하면 된다.

ROLLBACK;   -- ← 기대값 일치 시 COMMIT 으로 고쳐 재실행 (ADR-0053 E9 규약)
