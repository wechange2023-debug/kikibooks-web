-- =============================================================================
-- adr0059_d2b_reading_stats_rpc.sql — ADR-0059 D2-b 자녀 독서 집계 RPC (리허설본)
--
-- ★ COMMIT 은 팀장이 SQL Editor에서 직접 타이핑한다. 이 파일은 리허설 종료 상태다. ★
--    파일 마지막 문장이 ROLLBACK; 이므로, 그대로 실행하면 함수는 **생성되지 않는다**.
--    실제 반영은 팀장이 결과를 확인한 뒤 ROLLBACK 대신 COMMIT 을 직접 입력해서 한다.
--
-- 목적  : 애플리케이션이 reading_sessions 행을 전량 받아 JS로 세는 구조를 폐기하고,
--         DB가 집계한 4개 수치만 왕복 1회로 받는다. 행 수와 무관해지므로 PostgREST
--         행 상한(Max rows = 1,000) 절단 문제가 구조적으로 소멸한다(ADR-0059 D2).
-- 성격  : DDL 1문(CREATE OR REPLACE FUNCTION) + 검증 SELECT 1문. 데이터 변경 0건.
--         BEGIN … ROLLBACK 으로 감싼 리허설이라 실행해도 DB 상태가 남지 않는다.
-- 실행법: 파일 전체를 SQL Editor에 붙여넣고 한 번에 실행한다. 결과 표 1개(1행)를 확인한다.
--
-- 반환 4항목 (2026-08-18 팀장 확정 — ADR-0024 O2 "권수 = 책 종수" 정의 준수)
-- -----------------------------------------------------------------------------
--   session_rows        reading_sessions 행 수(총계). 진단·길이 검증용 원시 수치다.
--   completed_titles    is_completed = true 인 DISTINCT book_id **종수**.
--   in_progress_titles  완독 이력이 **전혀 없는** DISTINCT book_id 종수.
--                       ★ completed_titles 와 상호 배타 — 같은 책을 두 번 읽어 한 세션은
--                         완독, 한 세션은 미완인 경우 "읽는 중"에 넣지 않는다. 이 중복
--                         계상이 "읽는 중 930권" 허위 수치의 구조적 원인 중 하나였다.
--   last_read_at        완독 세션의 MAX(completed_at). 완독이 없으면 NULL.
--
--   행 수 기준(세션 행 = 권수)으로 바꾸는 것은 곧 ADR-0024 O2 정의 개정이므로 하지 않는다.
--   ADR-0059 는 "산출 경로만 바꾸며 정의는 개정하지 않는다"를 명시한다.
--
-- RLS · 보안 (타협 불가)
-- -----------------------------------------------------------------------------
--   SECURITY INVOKER 로 만든다. 함수가 호출자 권한으로 실행되면 reading_sessions 의
--   기존 RLS(001_initial_schema.sql §9.4 "parents can view own children sessions")가
--   그대로 적용되어, 남의 자녀 통계가 열리는 표면이 애초에 생기지 않는다.
--   SECURITY DEFINER 는 쓰지 않는다 — RLS 를 우회하므로 함수 안에서 auth.uid() 소유권
--   검증을 직접 해야 하고, 그 한 줄을 빠뜨리면 전 사용자 통계가 열린다(ADR-0059 D2-b).
--   PostgreSQL 함수의 기본값이 INVOKER 이지만, 의도를 드러내기 위해 명시한다.
--
--   SET search_path = '' 로 고정하고 모든 참조를 스키마 정규화했다(Supabase 권고).
--   EXECUTE 권한은 기본값(PUBLIC)을 그대로 둔다 — SECURITY INVOKER + RLS 이므로
--   비로그인 호출자는 0행만 본다. 권한 축소가 필요하면 별도 결정으로 다룬다.
--
-- 파라미터명 p_child_id 인 이유
-- -----------------------------------------------------------------------------
--   파라미터를 child_id 로 두면 본문의 reading_sessions.child_id 컬럼과 이름이 겹쳐
--   "column reference is ambiguous" 로 깨진다. 접두사 p_ 로 분리했다.
--   따라서 PostgREST 호출 키도 p_child_id 다: rpc('get_child_reading_stats',
--   { p_child_id: childId }). 호출부 코드는 본 파일 범위 밖이다(다음 지시서).
--
-- 함수명이 ADR-0059 의 get_mypage_summary 와 다른 이유
-- -----------------------------------------------------------------------------
--   ADR-0059 D2-b 의 최종 계약 get_mypage_summary 는 3수치에 더해 목록 20권과
--   P1(이어읽기·배지·더보기)까지 한 함수로 반환한다. 그 반환 형태는 O-5(P1 화면 요구
--   확정)가 닫혀야 정해진다(ADR-0059 실행 순서 3단계). 본 파일은 그 앞 단계인 집계
--   4수치만 담으므로, 최종 계약명을 미리 점유하지 않도록 get_child_reading_stats 로 둔다.
--
-- 관련: docs/adr/0059-reading-sessions-row-cap.md D2-b · docs/adr/0024-member-mypage.md O2
-- 작성: 2026-08-18 워커 / 기준 HEAD c67ec70
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) 함수 정의 — CTE 단일 구문(임시 표 미사용). LANGUAGE sql · STABLE · INVOKER.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_child_reading_stats(p_child_id uuid)
RETURNS TABLE (
  session_rows       bigint,
  completed_titles   bigint,
  in_progress_titles bigint,
  last_read_at       timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  WITH scoped AS (
    -- RLS 가 이미 본인 자녀로 좁히지만, 명시 필터를 2차 방어선으로 둔다.
    SELECT rs.book_id, rs.is_completed, rs.completed_at
    FROM public.reading_sessions AS rs
    WHERE rs.child_id = p_child_id
  ),
  completed AS (
    SELECT DISTINCT s.book_id
    FROM scoped AS s
    WHERE s.is_completed
  ),
  in_progress AS (
    -- 완독 종수 집합과의 차집합 — 완독 이력이 하나라도 있는 책은 제외한다.
    SELECT DISTINCT s.book_id
    FROM scoped AS s
    WHERE NOT s.is_completed
      AND NOT EXISTS (
        SELECT 1 FROM completed AS c WHERE c.book_id = s.book_id
      )
  )
  SELECT
    (SELECT count(*) FROM scoped)      AS session_rows,
    (SELECT count(*) FROM completed)   AS completed_titles,
    (SELECT count(*) FROM in_progress) AS in_progress_titles,
    (
      SELECT max(s.completed_at)
      FROM scoped AS s
      WHERE s.is_completed
    ) AS last_read_at;
$function$;

-- -----------------------------------------------------------------------------
-- 2) 검증 — 함수 존재 + 시그니처 + 보안 모드 확인 (조회 전용)
--
--    통과 기준
--      ① 결과 1행
--      ② args   = 'p_child_id uuid'
--      ③ result = 'TABLE(session_rows bigint, completed_titles bigint,
--                        in_progress_titles bigint, last_read_at timestamp with time zone)'
--      ④ security = 'INVOKER'   ← DEFINER 로 나오면 즉시 ROLLBACK 하고 보고할 것
--      ⑤ volatility = 's'(STABLE)
-- -----------------------------------------------------------------------------
SELECT
  n.nspname                                                   AS schema,
  p.proname                                                   AS function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid)        AS args,
  pg_catalog.pg_get_function_result(p.oid)                    AS result,
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END     AS security,
  p.provolatile                                               AS volatility
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n
  ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_child_reading_stats';

-- -----------------------------------------------------------------------------
-- 3) 리허설 종료 — 여기까지가 예행 연습이다.
--    반영하려면 팀장이 아래 ROLLBACK 을 COMMIT 으로 바꿔 직접 타이핑한다.
-- -----------------------------------------------------------------------------
ROLLBACK;
