-- =============================================================================
-- profiles.role 보호 — ADR-0068 D1·D2  (리뷰 P-2-1 지적 #1 / P0 조치)
-- 작성 2026-08-22 · 워커(Claude Code) · 실행은 팀장 전속
-- =============================================================================
--
-- ★ 팀장께 — 실행 방법
--
--   1) 이 파일을 Supabase SQL Editor에 **그대로** 붙여 한 번 실행하십시오.
--      마지막이 ROLLBACK이라 **아무것도 바뀌지 않습니다.**
--   2) 화면에 뜨는 **결과 표**를 보십시오. `구분` 열이 세 종류로 나옵니다.
--        1. 시뮬레이션 … 4행  ← 여기가 판정입니다
--        2. 트리거      … 이 트랜잭션에서 만들어진 트리거
--        3. 정책        … profiles의 RLS 정책
--      기대값(시뮬레이션 4행):
--        [0] 역할 전환 가능 …
--        [1] PASS — 일반 사용자의 role 변경이 거부됨
--        [2] PASS — 일반 사용자의 INSERT가 parent로 강제됨
--        [3] PASS — service_role 경로는 허용됨
--   3) [1][2][3]이 전부 PASS면, **맨 아래 `ROLLBACK;` 을 `COMMIT;` 으로 바꿔 다시 실행**하십시오.
--      그때 비로소 트리거·정책이 실제로 적용됩니다.
--   4) 하나라도 FAIL이거나 [0]이 "불가"면 **COMMIT하지 마시고** 결과 표를 알려 주십시오.
--
--   ※ RAISE NOTICE를 쓰지 않습니다 — Supabase SQL Editor가 NOTICE를 화면에 표시하지 않아
--     판정이 보이지 않았습니다. 그래서 결과를 세션 변수에 모았다가 **마지막 SELECT 한 표**로
--     함께 출력합니다.
--
-- ★ 안전 설계
--   시뮬레이션 1~3이 만드는 데이터 변경은 각 블록 안에서 **스스로 되감습니다**
--   (되감기 전용 예외 ADR0068_UNWIND로 하위 트랜잭션을 되돌림). 따라서 3)에서 COMMIT하더라도
--   **커밋되는 것은 트리거·함수·정책 정의뿐**이고, 모의 UPDATE/INSERT는 남지 않습니다.
--
--   ★★ 결과 기록(set_config)은 반드시 **하위 트랜잭션 밖**에서 합니다.
--      하위 트랜잭션 안에서 기록하면 되감길 때 기록도 함께 사라져 판정이 빈칸이 됩니다.
--      각 블록의 기록 지점에 ★ 표시를 달아 뒀습니다.
--
-- 원복: ADR-0068 §원복 참조 (트리거·함수 DROP 2줄)
-- 저장소 기록용 정본: supabase/migrations/010_protect_profiles_role.sql
-- =============================================================================

BEGIN;

-- 결과 누적 변수 초기화 (재실행 시 이전 값이 남지 않게)
do $init$
begin
  perform set_config('adr0068.results', '', true);
end;
$init$;

-- -----------------------------------------------------------------------------
-- D1. 보호 트리거
-- -----------------------------------------------------------------------------
-- 우회 판정식 (ADR-0068 D1):
--   ① coalesce(auth.role(),'') = 'service_role'
--        → PostgREST를 통한 service_role 요청.
--   ② coalesce(current_setting('request.jwt.claims', true),'') = ''
--        → JWT가 없는 직접 접속(SQL Editor·마이그레이션·psql).
--          이 항이 없으면 팀장의 SQL Editor 작업까지 막혀 D3(관리자 지정)이 불가능해진다.
--
-- SECURITY DEFINER를 쓰지 않는다 — 권한 상승이 필요 없고, 기본값(INVOKER)이 더 좁다.
create or replace function public.protect_profiles_role()
returns trigger
language plpgsql
as $fn$
begin
  -- 우회 대상은 그대로 통과
  if coalesce(auth.role(), '') = 'service_role'
     or coalesce(current_setting('request.jwt.claims', true), '') = ''
  then
    return new;
  end if;

  -- INSERT — 거부하지 않고 'parent'로 덮어쓴다.
  --   거부하면 ensureProfile(lib/auth/ensure-profile.ts:30-35)의 upsert가 실패해
  --   정상 로그인이 깨질 수 있다. 덮어쓰기는 공격만 무력화한다.
  if tg_op = 'INSERT' then
    new.role := 'parent';
    return new;
  end if;

  -- UPDATE — role을 바꾸려 하면 소리 내어 거부한다(fail-loud).
  --   앱 코드에 role을 쓰는 경로가 0건이므로(ADR-0068 §영향 범위) 시도 자체가 비정상 신호다.
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

drop trigger if exists profiles_protect_role on public.profiles;

create trigger profiles_protect_role
  before insert or update on public.profiles
  for each row execute function public.protect_profiles_role();

-- -----------------------------------------------------------------------------
-- D2. UPDATE 정책에 WITH CHECK 명시 (행위 동일 — 읽는 사람을 위한 명시화 + 2중 방어)
-- -----------------------------------------------------------------------------
drop policy if exists "users can update own profile" on public.profiles;

create policy "users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- =============================================================================
-- 시뮬레이션 (전부 스스로 되감음 — COMMIT해도 데이터는 남지 않는다)
--   판정 결과는 세션 변수 adr0068.results에 모았다가 맨 아래 SELECT로 출력한다.
-- =============================================================================

-- [0] 역할 전환이 가능한 환경인지 먼저 확인한다.
do $sim0$
declare
  v_ok  boolean := false;
  v_err text    := null;
  v_msg text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('role', 'none', true);
    v_ok := true;
  exception when others then
    v_err := sqlerrm;
  end;

  -- ★ 기록 지점 — 하위 트랜잭션 밖. 안에서 하면 되감길 때 함께 사라진다.
  if v_ok then
    v_msg := '[0] 역할 전환 가능 — 시뮬레이션 1~3의 결과가 유효합니다';
  else
    v_msg := '[0] 역할 전환 불가 (' || coalesce(v_err, '?') || ') — 아래 1~3 결과는 의미가 없습니다.'
          || ' 대안: 팀장 테스트 계정으로 로그인한 뒤 브라우저에서 Supabase REST에'
          || ' PATCH /rest/v1/profiles?id=eq.<본인id> {"role":"admin"} 을 보내 거부되는지 확인.';
  end if;
  perform set_config('adr0068.results',
    coalesce(current_setting('adr0068.results', true), '') || v_msg || E'\n', true);
end;
$sim0$;

-- [1] 일반 사용자가 자기 role을 admin으로 바꾸려 한다 → 기대: 거부
do $sim1$
declare
  v_id      uuid;
  v_rows    int     := -1;
  v_after   text    := null;
  v_blocked boolean := false;
  v_err     text    := null;
  v_msg     text;
begin
  select id into v_id from public.profiles where role = 'parent' limit 1;
  if v_id is null then
    -- ★ 기록 지점 — 하위 트랜잭션에 진입하지 않은 경로
    perform set_config('adr0068.results',
      coalesce(current_setting('adr0068.results', true), '')
      || '[1] SKIP — role=parent 인 행이 없어 모의할 수 없습니다' || E'\n', true);
    return;
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_id::text, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    update public.profiles set role = 'admin' where id = v_id;
    get diagnostics v_rows = row_count;

    perform set_config('role', 'none', true);
    select role into v_after from public.profiles where id = v_id;

    raise exception 'ADR0068_UNWIND';   -- 되감기 전용 신호(판정 아님)
  exception when others then
    if sqlerrm = 'ADR0068_UNWIND' then
      v_blocked := false;               -- 트리거가 막지 않았다
    else
      v_blocked := true;                -- 트리거 또는 RLS가 예외로 막았다
      v_err := sqlerrm || ' (SQLSTATE ' || sqlstate || ')';
    end if;
    perform set_config('role', 'none', true);
  end;

  -- ★ 기록 지점 — 하위 트랜잭션이 되감긴 뒤. plpgsql 변수는 되감기 대상이 아니라 값이 살아 있다.
  if v_blocked then
    v_msg := '[1] PASS — 일반 사용자의 role 변경이 거부됨: ' || v_err;
  elsif v_after = 'admin' then
    v_msg := '[1] FAIL ★ 일반 사용자가 role을 admin으로 바꿨습니다';
  else
    v_msg := '[1] PASS(부분) — 예외는 없었으나 변경되지 않음 (영향행=' || v_rows
          || ', 현재값=' || coalesce(v_after, '?') || '). RLS가 막은 경우입니다';
  end if;
  perform set_config('adr0068.results',
    coalesce(current_setting('adr0068.results', true), '') || v_msg || E'\n', true);

  perform set_config('request.jwt.claims', '', true);
end;
$sim1$;

-- [2] 일반 사용자가 role='admin'으로 새 프로필을 만든다 → 기대: parent로 강제 저장
do $sim2$
declare
  v_id     uuid;
  v_after  text    := null;
  v_failed boolean := false;
  v_err    text    := null;
  v_msg    text;
begin
  select u.id into v_id
  from auth.users u
  left join public.profiles p on p.id = u.id
  where p.id is null
  limit 1;

  if v_id is null then
    -- ★ 기록 지점 — 하위 트랜잭션에 진입하지 않은 경로
    perform set_config('adr0068.results',
      coalesce(current_setting('adr0068.results', true), '')
      || '[2] SKIP — 프로필이 없는 auth.users 행이 없어 INSERT 경로를 모의할 수 없습니다'
      || ' (정상입니다. 모든 사용자가 이미 프로필을 갖고 있다는 뜻입니다.)' || E'\n', true);
    return;
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_id::text, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    insert into public.profiles (id, email, role)
    values (v_id, 'adr0068-sim-' || v_id::text || '@example.invalid', 'admin');

    perform set_config('role', 'none', true);
    select role into v_after from public.profiles where id = v_id;

    raise exception 'ADR0068_UNWIND';   -- 되감기 전용 신호(판정 아님)
  exception when others then
    if sqlerrm <> 'ADR0068_UNWIND' then
      v_failed := true;
      v_err := sqlerrm || ' (SQLSTATE ' || sqlstate || ')';
    end if;
    perform set_config('role', 'none', true);
  end;

  -- ★ 기록 지점 — 하위 트랜잭션이 되감긴 뒤
  if v_failed then
    v_msg := '[2] INFO — INSERT가 다른 이유로 실패했습니다: ' || v_err;
  elsif v_after = 'parent' then
    v_msg := '[2] PASS — INSERT가 parent로 강제됐습니다 (요청값 admin → 저장값 parent)';
  else
    v_msg := '[2] FAIL ★ INSERT로 role=' || coalesce(v_after, '?') || ' 가 저장됐습니다';
  end if;
  perform set_config('adr0068.results',
    coalesce(current_setting('adr0068.results', true), '') || v_msg || E'\n', true);

  perform set_config('request.jwt.claims', '', true);
end;
$sim2$;

-- [3] service_role 경로로 role을 바꾼다 → 기대: 허용 (D3 관리자 지정이 계속 가능해야 한다)
do $sim3$
declare
  v_id     uuid;
  v_after  text    := null;
  v_denied boolean := false;
  v_err    text    := null;
  v_msg    text;
begin
  select id into v_id from public.profiles where role = 'parent' limit 1;
  if v_id is null then
    -- ★ 기록 지점 — 하위 트랜잭션에 진입하지 않은 경로
    perform set_config('adr0068.results',
      coalesce(current_setting('adr0068.results', true), '')
      || '[3] SKIP — role=parent 인 행이 없어 모의할 수 없습니다' || E'\n', true);
    return;
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_id::text, 'role', 'service_role')::text, true);
    perform set_config('role', 'service_role', true);

    update public.profiles set role = 'curator' where id = v_id;

    perform set_config('role', 'none', true);
    select role into v_after from public.profiles where id = v_id;

    raise exception 'ADR0068_UNWIND';   -- 되감기 전용 신호(판정 아님)
  exception when others then
    if sqlerrm <> 'ADR0068_UNWIND' then
      v_denied := true;
      v_err := sqlerrm || ' (SQLSTATE ' || sqlstate || ')';
    end if;
    perform set_config('role', 'none', true);
  end;

  -- ★ 기록 지점 — 하위 트랜잭션이 되감긴 뒤
  if v_denied then
    v_msg := '[3] FAIL ★ service_role 경로가 거부됐습니다: ' || v_err
          || ' — 이 상태로 COMMIT하면 관리자 지정(ADR-0068 D3)이 불가능해집니다.';
  elsif v_after = 'curator' then
    v_msg := '[3] PASS — service_role 경로는 허용됩니다 (parent → curator)';
  else
    v_msg := '[3] FAIL ★ service_role인데도 반영되지 않았습니다 (현재값='
          || coalesce(v_after, '?') || ')';
  end if;
  perform set_config('adr0068.results',
    coalesce(current_setting('adr0068.results', true), '') || v_msg || E'\n', true);

  perform set_config('request.jwt.claims', '', true);
end;
$sim3$;

-- =============================================================================
-- 최종 출력 — 시뮬레이션 판정 + 트리거·정책 현황을 한 표로
-- =============================================================================
select '1. 시뮬레이션'::text as 구분,
       ''::text             as 이름,
       s.line::text         as 내용,
       s.ord                as 순서
from regexp_split_to_table(
       coalesce(current_setting('adr0068.results', true), ''), E'\n'
     ) with ordinality as s(line, ord)
where s.line <> ''

union all

select '2. 트리거'::text,
       t.tgname::text,
       pg_get_triggerdef(t.oid)::text,
       100 + row_number() over (order by t.tgname)
from pg_trigger t
where t.tgrelid = 'public.profiles'::regclass
  and not t.tgisinternal

union all

select '3. 정책'::text,
       p.policyname::text,
       (p.cmd || ' | USING=' || coalesce(p.qual, '-') || ' | CHECK=' || coalesce(p.with_check, '-'))::text,
       200 + row_number() over (order by p.policyname)
from pg_policies p
where p.schemaname = 'public' and p.tablename = 'profiles'

order by 순서;

-- =============================================================================
-- ★ 여기가 마지막 줄입니다.
--   결과 표의 「1. 시뮬레이션」 행에서 [1][2][3]이 전부 PASS면
--   아래 ROLLBACK을 COMMIT으로 바꿔 다시 실행하십시오.
-- =============================================================================
ROLLBACK;
