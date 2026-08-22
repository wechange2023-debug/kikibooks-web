-- 목적: profiles.role 자가 승격 차단 — 보호 트리거 신설 + UPDATE 정책 WITH CHECK 명시
-- ADR: ADR-0068 (D1 트리거 · D2 정책 명시 · D3 관리자 지정 절차 · D4 컬럼 REVOKE 미채택)
-- 적용일: (팀장 Supabase SQL Editor 실행 후 이 줄에 날짜 기입)
-- 적용: 본 파일은 **기록·재현용 정본**이다. 자동 실행되지 않는다.
--       실행 당시 사용한 리허설본은 scripts/sql/2026-08-22_protect_profiles_role.sql
--       (BEGIN … ROLLBACK + 시뮬레이션 3건 + 사후 검증 SELECT 포함)이며,
--       팀장이 SQL Editor에서 **1회** 실행한다. 009와 같은 취급이다
--       (009_book_review_status_tts_requested.sql:3-7 선례).
--
-- 배경(리뷰 P-2-1 지적 #1 · P0):
--   001_initial_schema.sql:25-26 이 role을 평범한 컬럼으로 두고 CHECK가 'admin'을 허용한다.
--   :231-234 의 UPDATE 정책은 WITH CHECK가 없어 USING 식이 그대로 쓰이므로 role 값을
--   검사하지 않는다. GRANT/REVOKE 0건 + 보호 트리거 0건(팀장 실측 A·B·C)이라
--   로그인한 누구나 PostgREST로 자기 role을 'admin'으로 바꿀 수 있었다.
--
-- 주의:
--   - 트리거 1개 + 함수 1개 신설, 기존 정책 1개 재생성. 컬럼 추가·삭제 0건.
--   - books / book_text / book_audio / book_review 무접촉.
--     attribution_text NOT NULL(Hard Rule 1)·enforce_commercial_license(Hard Rule 2) 무관.
--     ※ 2026-08-22 팀장 실측 F: books.attribution_text 의 is_nullable = 'NO'
--       (= NOT NULL 생존). 본 변경은 그것을 건드리지 않는다.
--   - 데이터 변경 0행. 기존 role 값은 그대로 둔다(팀장 실측 H: 관리자 1명, 악용 흔적 없음).
--   - 재실행 안전: 함수는 CREATE OR REPLACE, 트리거·정책은 DROP IF EXISTS 후 재생성 → 멱등.
--   - 원복: 아래 [원복] 참조.
--
-- 우회 판정식이 두 항인 이유 (ADR-0068 D1):
--   ① auth.role() = 'service_role'  — PostgREST service_role 요청
--   ② request.jwt.claims 미설정      — JWT 없는 직접 접속(SQL Editor·마이그레이션·psql)
--   ②가 없으면 팀장의 SQL Editor 작업까지 막혀 관리자 지정(D3)이 불가능해진다.
--   SQL Editor는 postgres 역할로 붙고 request.jwt.claims가 설정되지 않아
--   auth.role()이 NULL을 돌려주기 때문이다.

-- =============================================================================
-- 1. 보호 함수
-- =============================================================================
create or replace function public.protect_profiles_role()
returns trigger
language plpgsql
as $fn$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or coalesce(current_setting('request.jwt.claims', true), '') = ''
  then
    return new;
  end if;

  -- INSERT는 거부하지 않고 'parent'로 덮어쓴다.
  -- 거부하면 ensureProfile(lib/auth/ensure-profile.ts:30-35)의 upsert 실패로
  -- 정상 로그인이 깨질 수 있다. 덮어쓰기는 공격만 무력화한다.
  if tg_op = 'INSERT' then
    new.role := 'parent';
    return new;
  end if;

  -- UPDATE에서 role 변경 시도는 소리 내어 거부한다(fail-loud).
  -- 앱 코드에 role을 쓰는 경로가 전수 grep 0건이므로 시도 자체가 비정상 신호다.
  if new.role is distinct from old.role then
    raise exception
      'profiles.role은 변경할 수 없습니다. 관리자 지정은 service_role 경로로만 합니다 (ADR-0068 D1).'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

comment on function public.protect_profiles_role() is
  'ADR-0068 D1 — profiles.role 자가 승격 차단. INSERT는 parent 강제, UPDATE 변경은 거부. service_role·직접접속은 우회.';

-- =============================================================================
-- 2. 트리거 부착
-- =============================================================================
drop trigger if exists profiles_protect_role on public.profiles;

create trigger profiles_protect_role
  before insert or update on public.profiles
  for each row execute function public.protect_profiles_role();

-- =============================================================================
-- 3. UPDATE 정책에 WITH CHECK 명시 (ADR-0068 D2)
-- =============================================================================
-- 행위는 바뀌지 않는다 — WITH CHECK가 생략되면 PostgreSQL이 USING 식을 그대로 쓴다.
-- 그럼에도 명시하는 이유는 읽는 사람 때문이다. 지금 형태는 "새 행을 검사하지 않는다"처럼
-- 읽히고, 실제로 리뷰가 그 지점에서 멈춰 P0을 찾아냈다.
-- ★ D1이 실질 방어이고 D2는 문서화 겸 2중 방어다. 둘은 대체재가 아니다 —
--   트리거가 사라지면 이 정책만으로는 role 변경을 막지 못한다.
drop policy if exists "users can update own profile" on public.profiles;

create policy "users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- =============================================================================
-- [원복]
-- =============================================================================
--   drop trigger if exists profiles_protect_role on public.profiles;
--   drop function if exists public.protect_profiles_role();
--   -- D2(정책)는 되돌릴 필요가 없다(행위 동일).

-- =============================================================================
-- [검증 쿼리] — 실행은 팀장 몫. 주석 해제 후 SQL Editor에서 확인.
-- =============================================================================
-- select tgname, pg_get_triggerdef(t.oid)
--   from pg_trigger t
--  where t.tgrelid = 'public.profiles'::regclass and not t.tgisinternal;
--
-- select policyname, cmd, qual, with_check
--   from pg_policies where schemaname='public' and tablename='profiles';
