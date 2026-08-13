-- 목적: book_review.status CHECK 제약에 'tts_requested' 추가 (4상태 → 5상태)
-- ADR: ADR-0058 (D2 요청 상태 모델 · D3 전이표)
-- 적용일: 2026-08-13 (팀장 Supabase SQL Editor 실행 완료 — 운영 DB 반영 완료)
-- 적용: 본 파일은 **기록·재현용 정본**이다. 운영 DB에는 이미 적용돼 있으며,
--       실행 당시 사용한 리허설본은 docs/sql/adr0058/01_migration_009_tts_requested.sql
--       (BEGIN … ROLLBACK + 선검증/후검증 SELECT 포함)이다.
-- ★실행 순서: 본 009 → docs/sql/adr0058/02_seed_708_book_review.sql(708권 draft 시드)
--             → docs/sql/adr0058/03_verify.sql(사후 검증)
--             ※ 둘 다 2026-08-13 실행 완료. 실측 결과는 아래 [실행 기록] 참조.
-- 주의:
--   - CHECK 제약 1개 교체만. 컬럼 추가·삭제 0건, RLS·정책 무변경
--     (006 §3.2 — book_review는 정책 0개 = service_role 전용 유지).
--   - 006:35-36의 CHECK는 `constraint <이름>` 절이 없는 **인라인 무명 제약**이라
--     제약 이름이 Postgres 자동 생성명이다. 따라서 이름을 하드코딩하지 않고
--     pg_constraint에서 **동적 조회 후 삭제**한다. status CHECK가 정확히 1개가
--     아니면 RAISE EXCEPTION으로 중단한다(fail-closed).
--     ※ 2026-08-13 실측: 자동 생성명이 우연히 명시명과 동일한 book_review_status_check
--       였다. 그래도 동적 조회 경로를 유지한다 — 다른 환경(스테이징·재구축)에서
--       이름이 다를 수 있고, 추정으로 DROP하면 fail-loud가 아니라 오작동이 된다.
--   - 재생성 시에는 이름을 book_review_status_check로 **명시 고정**한다.
--     이후 개정에서 이름 추정이 불필요해진다.
--   - 기존 행의 status 값은 전부 새 집합의 부분집합이라 **데이터 변경 0행**이다.
--   - books / book_audio / book_text 무접촉. attribution_text NOT NULL(Hard Rule 1)·
--     enforce_commercial_license(Hard Rule 2) 무관.
--   - 재실행 안전: 삭제 후 동일 이름으로 재생성하므로 멱등이다.
--   - 원복: (1) update public.book_review set status='confirmed' where status='tts_requested';
--           (2) 아래 add constraint의 값 목록에서 'tts_requested'를 빼고 재실행.

-- =============================================================================
-- 1. 기존 status CHECK 제약 삭제 (이름 동적 조회 — 추정 금지)
-- =============================================================================
do $$
declare
  v_name  text;
  v_count int;
begin
  select count(*), min(conname)
    into v_count, v_name
    from pg_constraint
   where conrelid = 'public.book_review'::regclass
     and contype  = 'c'
     and pg_get_constraintdef(oid) ilike '%status%';

  if v_count <> 1 then
    raise exception
      'STOP: book_review의 status CHECK 제약이 %개다(기대 1). 수동 확인 필요.', v_count;
  end if;

  execute format('alter table public.book_review drop constraint %I', v_name);
  raise notice '기존 제약 삭제: %', v_name;
end $$;

-- =============================================================================
-- 2. 5상태 CHECK 제약 재생성 (이름 명시 고정)
-- =============================================================================
alter table public.book_review
  add constraint book_review_status_check
  check (status in ('draft','in_review','confirmed','tts_requested','tts_done'));

-- =============================================================================
-- 3. 테이블 주석 갱신 (006:43-44의 4단계 표기 → 5단계)
-- =============================================================================
comment on table public.book_review is
  '책 단위 검수 상태. status 5단계(draft/in_review/confirmed/tts_requested/tts_done). tts_requested = 관리자 화면의 TTS 생성 요청(ADR-0058 D2), tts_done 전이는 로컬 파이프라인 소관(ADR-0058 D6). 공개는 books.is_active가 단일진실(ADR-0046 D6).';

-- =============================================================================
-- 검증 쿼리 (실행은 PM 몫 — 아래 주석 해제 후 SQL Editor에서 확인)
-- =============================================================================
-- (a) 제약 확인 (기대: conname = book_review_status_check, definition에 5개 값)
-- select conname, pg_get_constraintdef(oid) as definition from pg_constraint
--   where conrelid = 'public.book_review'::regclass and contype = 'c';

-- (b) 기존 행 무영향 확인 (기대: 009 실행 전후 동일)
-- select status, count(*) as books from public.book_review group by status order by status;

-- (c) 새 집합 밖의 값 확인 (기대: 0행)
-- select status, count(*) from public.book_review
--   where status not in ('draft','in_review','confirmed','tts_requested','tts_done')
--   group by status;

-- =============================================================================
-- 실행 기록 (2026-08-13, 팀장 SQL Editor)
-- =============================================================================
-- · 009 적용: 선검증 (a) 실측에서 기존 제약 이름이 book_review_status_check로 확인됨.
--   본체 실행 후 후검증 verdict = PASS(5상태 반영). 데이터 변경 0행.
-- · 후속 시드(docs/sql/adr0058/02) 적용 결과: book_review 152 → 860행 (+708),
--   후검증 860 / 결손 0 / asb 527 / bloom 142 / book_dash 191 → verdict PASS.
--   반영 확인 분포: asb draft 527 · bloom draft 142 · book_dash draft 179 · book_dash tts_done 12.
--   (book_dash 179 = 기존 draft 140 + 신규 39 / tts_done 12 = ADR-0052 시범 12권)
-- · 이로써 ADR-0056 O5(신규 코호트 book_review 미시드)는 해소됐다 — ADR-0058 D5·D8.

-- =============================================================================
-- 끝. 다음 마이그레이션은 010_<목적>.sql 형식으로 작성.
-- =============================================================================
