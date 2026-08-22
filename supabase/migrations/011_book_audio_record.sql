-- 목적: book_audio 테이블·RLS를 저장소 이력에 **기록**한다 (신규 변경 0건)
-- ADR: ADR-0034 결정 ①(스키마)·②(경로)·(d)(RLS) + Amendment #1(kind 컬럼)
-- 배경: 리뷰 P-2-1 지적 #4 (P1) — 코드가 쓰는 book_audio를 만드는 마이그레이션이 없어
--       스키마·RLS가 버전 관리 밖에 있었다. books.has_audio 컬럼도 같은 상태였다.
-- 적용일: **실행 불필요** — 아래 "적용" 참조
--
-- 적용:
--   본 파일은 **기록·재현용 정본**이며 **자동 실행되지 않는다**(009·010과 동일 취급 —
--   009_book_review_status_tts_requested.sql:3-7 선례).
--   운영 DB에는 **2026-07-04에 팀장이 SQL Editor에서 이미 실행**했고(ADR-0034:64
--   "실제 실행된 SQL … 직접 실행, 성공"), kind 컬럼은 Amendment #1 시점에 추가됐다.
--   전 구문이 `if not exists` / `if exists` 형태라 재실행해도 무해하지만,
--   **다시 실행할 이유가 없다.** 새 환경(스테이징·재구축)을 만들 때만 쓴다.
--
-- 근거 (이 파일의 내용은 추측이 아니다):
--   - 스키마 본문   : ADR-0034 `docs/adr/0034-tts-audio-storage-implementation.md:67-81`
--                     (당시 실행된 SQL 원문이 그대로 박제돼 있다)
--   - kind 컬럼     : 같은 ADR Amendment #1 `:188-192`
--   - RLS 방침      : 같은 ADR `:82` · `:98-99` (enable + anon/authenticated SELECT 공개읽기,
--                     쓰기 정책 없음 = service_role 전용)
--   - RLS 실물      : 2026-08-22 팀장 실측 — D: RLS 켜짐 / E: 정책 "public read book audio"
--                     SELECT, USING = true
--   - 컬럼 사용처   : lib/book/audio-manifest.ts:179-186(book_id·kind·voice) ·
--                     :290-301(kind·page_index·audio_path·marks_path) ·
--                     scripts/quiz_pilot/dump_q1.mjs:44(duration_ms) ·
--                     scripts/tts_pilot/gen_book_audio_sql.py:196(INSERT 생성기)
--
-- 주의:
--   - **신규 변경 0건.** 이미 존재하는 것을 문서화할 뿐이다.
--   - books / book_text / book_review 무접촉(단, books.has_audio는 §4에서 함께 기록).
--     attribution_text NOT NULL(Hard Rule 1)·enforce_commercial_license(Hard Rule 2) 무관.
--   - 데이터 변경 0행.
--
-- ★ 팀장 실측 필요 — 아래 §0 확인 SQL
--   본 파일은 ADR 기록과 코드 사용처를 근거로 재구성한 것이라, 2026-07-04 이후 손으로 더해진
--   컬럼·제약·인덱스가 있으면 반영돼 있지 않다. 아래 SELECT를 한 번 돌려 결과를 알려 주시면
--   차이를 이 파일에 반영하겠다. **읽기 전용이라 트랜잭션이 필요 없다.**

-- =============================================================================
-- 0. [팀장 실측용] 실물과 대조하는 읽기 전용 SQL — 그대로 붙여 실행 (변경 0건)
-- =============================================================================
-- select 'A. 컬럼' as 구분, column_name as 이름,
--        data_type || ' | null허용=' || is_nullable || ' | 기본값=' || coalesce(column_default,'-') as 내용
--   from information_schema.columns
--  where table_schema='public' and table_name='book_audio'
-- union all
-- select 'B. 제약', con.conname, pg_get_constraintdef(con.oid)
--   from pg_constraint con
--  where con.conrelid = 'public.book_audio'::regclass
-- union all
-- select 'C. 인덱스', indexname, indexdef
--   from pg_indexes where schemaname='public' and tablename='book_audio'
-- union all
-- select 'D. RLS', c.relname, case when c.relrowsecurity then 'RLS 켜짐' else 'RLS 꺼짐' end
--   from pg_class c join pg_namespace n on n.oid=c.relnamespace
--  where n.nspname='public' and c.relname='book_audio'
-- union all
-- select 'E. 정책', policyname, cmd || ' | USING=' || coalesce(qual,'-')
--   from pg_policies where schemaname='public' and tablename='book_audio'
-- union all
-- select 'F. books.has_audio', column_name, data_type || ' | null허용=' || is_nullable
--   from information_schema.columns
--  where table_schema='public' and table_name='books' and column_name='has_audio'
--  order by 1, 2;

-- =============================================================================
-- 1. book_audio — 페이지 단위 낭독 오디오 (ADR-0034 결정 ①)
-- =============================================================================
create table if not exists public.book_audio (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references public.books(id) on delete cascade,
  page_index   int  not null check (page_index >= 0),  -- 0-based 페이지 인덱스(경로 p00..과 정합)
  audio_path   text not null,                          -- book-audio 버킷 내 mp3 객체 키
  marks_path   text,                                   -- 동 word speech-marks JSON 객체 키
  voice        text not null,                          -- 예: 'danielle' (ADR-0052 Amd#2 확정 보이스)
  engine       text not null,                          -- 예: 'neural'
  rate         int  check (rate between 1 and 300),    -- 말하기 속도 %
  duration_ms  int  check (duration_ms >= 0),          -- 오디오 길이(ms)
  created_at   timestamptz not null default now(),
  unique (book_id, page_index, voice)                  -- ※ §2에서 kind 포함으로 재정의된다
);

-- marks_path가 NULL 허용인 이유(ADR-0034 (c)): 빈 텍스트 페이지는 음성이 스킵돼
-- speech-marks가 없을 수 있다. audio_path는 NOT NULL 유지.
--
-- ※ created_at은 코드에서 참조하는 곳이 0건이다(전수 grep). ADR-0034:77 기록을 근거로 적는다.

-- =============================================================================
-- 2. kind 컬럼 — 표지 트랙 수용 (ADR-0034 Amendment #1)
-- =============================================================================
-- 표지 행: kind='cover', page_index=0 고정 placeholder.
-- 표지 경로는 audio_path에 '.../cover.mp3'로 명시 저장되므로 page_index가 경로를 만들지 않는다.
alter table public.book_audio
  add column if not exists kind text not null default 'page';

-- CHECK·UNIQUE는 이름이 있어야 재실행 안전하게 다룰 수 있다.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.book_audio'::regclass
       and conname = 'book_audio_kind_check'
  ) then
    alter table public.book_audio
      add constraint book_audio_kind_check check (kind in ('page','cover'));
  end if;
end;
$$;

-- UNIQUE 재정의: (book_id, page_index, voice) → (book_id, kind, page_index, voice)
--   kind가 없으면 표지(cover,0,voice)와 첫 페이지(page,0,voice)가 page_index=0으로 충돌한다.
--   ※ 기존 UNIQUE의 제약명은 Postgres 자동 생성명이라 하드코딩하지 않는다.
--     001→002에서 같은 이유로 동적 조회 경로를 쓴 선례가 있다(002_add_cc_by_3_0_license.sql:11-15).
do $$
declare
  v_old text;
begin
  -- 새 UNIQUE가 이미 있으면 아무것도 하지 않는다(재실행 안전).
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.book_audio'::regclass
       and contype = 'u'
       and pg_get_constraintdef(oid) = 'UNIQUE (book_id, kind, page_index, voice)'
  ) then
    return;
  end if;

  select conname into v_old
    from pg_constraint
   where conrelid = 'public.book_audio'::regclass
     and contype = 'u'
     and pg_get_constraintdef(oid) = 'UNIQUE (book_id, page_index, voice)';

  if v_old is not null then
    execute format('alter table public.book_audio drop constraint %I', v_old);
  end if;

  alter table public.book_audio
    add constraint book_audio_book_kind_page_voice_key
    unique (book_id, kind, page_index, voice);
end;
$$;

-- =============================================================================
-- 3. RLS — 공개읽기, 쓰기 정책 없음 (ADR-0034 (d))
-- =============================================================================
-- 사유: 리더가 브라우저에서 mp3 메타(경로·marks)를 읽어야 하므로 SELECT는 공개.
--       쓰기 정책을 만들지 않으므로 anon/authenticated의 INSERT·UPDATE·DELETE는 전부 거부되고
--       service_role(팀장 SQL·업로드 스크립트)만 통과한다. 001 §9 주석 원칙과 동일한 방식이다.
-- 실물 확인: 2026-08-22 팀장 실측 — RLS 켜짐 / 정책 "public read book audio" SELECT USING=true.
alter table public.book_audio enable row level security;

drop policy if exists "public read book audio" on public.book_audio;

create policy "public read book audio"
  on public.book_audio
  for select
  using (true);

-- =============================================================================
-- 4. books.has_audio — 같은 ADR이 함께 추가한 컬럼 (기록 목적)
-- =============================================================================
-- ADR-0034:80-81이 book_audio와 **같은 SQL 블록**에서 추가했으나 마이그레이션에는 없었다.
-- ★ 현재 코드는 이 컬럼을 **읽지 않는다.** 오디오 유무 판정은 book_audio 조회로 단일화됐다
--   (lib/book/detail.ts:92 · lib/library/query.ts:157 — "has_audio 컬럼은 select하지 않는다").
--   컬럼 자체는 미접촉으로 남겨 둔다(삭제 판단은 별건).
alter table public.books
  add column if not exists has_audio boolean not null default false;

-- =============================================================================
-- [원복]
-- =============================================================================
--   본 파일은 기록용이라 원복 대상이 아니다. 실제로 book_audio를 지우면 낭독 기능 전체가
--   멈추므로 DROP 구문을 일부러 적지 않는다.

-- =============================================================================
-- [미확인 — 팀장 실측으로 메울 것]
-- =============================================================================
--   1) 2026-07-04 이후 손으로 추가된 컬럼·제약·인덱스가 있는지 (§0 A·B·C)
--   2) UNIQUE 제약의 실제 이름 (자동 생성명일 수 있다 — §2가 동적으로 다루므로 실행에는 무해)
--   3) book_audio에 걸린 트리거 유무 (§0에는 없음 — 필요하면 pg_trigger로 별도 확인)
--   4) created_at 컬럼의 실존 여부 (코드 참조 0건이라 ADR 기록만이 근거)
