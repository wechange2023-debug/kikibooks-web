-- 목적: 검수 데이터 모델 신규 2테이블 — book_text(페이지 단위 확정텍스트) / book_review(책 단위 검수상태)
-- ADR: ADR-0046 (D1~D6)
-- 적용일: (PM이 SQL Editor 실행 시 기입)
-- 적용: PM이 Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run
-- 주의:
--   - 신규 테이블 추가만. 기존 books / book_audio 컬럼·제약·트리거 미접촉 (Hard Rule 무저촉).
--   - enforce_commercial_license(license 전용)·attribution_text NOT NULL(Hard Rule 1) 무관.
--   - 재실행 안전(create table if not exists). RLS·정책은 create ... 후 조건부 재생성.

-- =============================================================================
-- 1. book_text — 페이지 단위 확정 텍스트 (책 1 : 페이지 N, ADR-0046 D1)
-- =============================================================================
create table if not exists public.book_text (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references public.books(id) on delete cascade,
  page_index   int  not null check (page_index >= 0),   -- 0-based, ADR-0046 D2 (page_no - 1)
  text         text not null default '',                -- 낭독 확정본 (SFX·DECOR 제외 결과, TTS 입력)
  blocks       jsonb,                                    -- 검수 원본 블록(role/bbox/size), speaker 키는 예약(D4)
  source       text not null default 'pdf_harvest_v1',  -- 초벌 출처
  updated_at   timestamptz not null default now(),
  unique (book_id, page_index)
);

comment on table public.book_text is
  '페이지 단위 확정 텍스트. text=낭독본(TTS 입력), blocks=검수 원본(SFX/대사 재분류용). ADR-0046 D3.';
comment on column public.book_text.page_index is
  '0-based (ADR-0046 D2). 확정 JSON page_no(1-based)에서 page_index = page_no - 1 로 적재.';

-- =============================================================================
-- 2. book_review — 책 단위 검수 상태 (책 1 : 1, ADR-0046 D1·D6)
-- =============================================================================
create table if not exists public.book_review (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null unique references public.books(id) on delete cascade,
  status       text not null default 'draft'
                 check (status in ('draft','in_review','confirmed','tts_done')),  -- ADR-0046 D6
  reviewer_id  uuid references public.profiles(id),      -- nullable
  reviewed_at  timestamptz,                              -- nullable
  note         text,
  updated_at   timestamptz not null default now()
);

comment on table public.book_review is
  '책 단위 검수 상태. status 4단계(draft/in_review/confirmed/tts_done). 공개는 books.is_active가 단일진실(ADR-0046 D6).';

-- =============================================================================
-- 2.5 updated_at 자동 갱신 트리거 (001 §8 선례 재사용 — 함수 신설 없음)
--     선례: touch_updated_at() (001_initial_schema.sql:184-190), profiles·children에 적용됨.
-- =============================================================================
drop trigger if exists book_text_touch_updated_at on public.book_text;
create trigger book_text_touch_updated_at
  before update on public.book_text
  for each row execute function touch_updated_at();

drop trigger if exists book_review_touch_updated_at on public.book_review;
create trigger book_review_touch_updated_at
  before update on public.book_review
  for each row execute function touch_updated_at();

-- =============================================================================
-- 3. Row Level Security (ADR-0034 book_audio 패턴 계승 — Phase A-1 [3])
-- =============================================================================
alter table public.book_text   enable row level security;
alter table public.book_review enable row level security;

-- 3.1 book_text — 활성 도서에 한해서만 SELECT 공개.
--     사유: 미검수 초벌 텍스트가 비활성(스테이징) 도서 경유로 새어나가지 않게 한다.
--     쓰기 정책 없음 → service_role/팀장 SQL만 통과 (books·book_audio 선례).
drop policy if exists "book_text readable for active books" on public.book_text;
create policy "book_text readable for active books"
  on public.book_text
  for select
  using (
    exists (
      select 1 from public.books b
      where b.id = book_text.book_id and b.is_active
    )
  );

-- 3.2 book_review — SELECT 정책 없음(= service_role 전용).
--     관리자 검수 화면은 서버(secret 키)에서 읽는다. 쓰기 정책도 없음(service_role 전용).
--     (정책을 만들지 않으면 anon/authenticated는 전 작업 거부 — 001 §9 주석 원칙.)

-- =============================================================================
-- 4. 검증 쿼리 (실행은 PM 몫 — 아래 주석 해제 후 SQL Editor에서 확인)
-- =============================================================================
-- (a) 테이블 2개 생성 확인 (기대: book_review, book_text 2행)
-- select table_name from information_schema.tables
--   where table_schema = 'public' and table_name in ('book_text','book_review')
--   order by table_name;

-- (b) RLS 활성 확인 (기대: 두 테이블 모두 rowsecurity = true)
-- select relname, relrowsecurity from pg_class
--   where relname in ('book_text','book_review');

-- (c) 정책 목록 확인 (기대: book_text 1개 / book_review 0개)
-- select tablename, policyname, cmd from pg_policies
--   where tablename in ('book_text','book_review')
--   order by tablename, policyname;

-- (d) updated_at 트리거 2개 생성 확인 (기대: book_text_touch_updated_at, book_review_touch_updated_at)
-- select event_object_table, trigger_name from information_schema.triggers
--   where event_object_table in ('book_text','book_review')
--   order by event_object_table, trigger_name;

-- =============================================================================
-- 끝. 다음 마이그레이션은 007_<목적>.sql 형식으로 작성.
-- =============================================================================
