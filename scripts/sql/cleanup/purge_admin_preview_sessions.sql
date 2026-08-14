-- 쓰기 문장 포함. 반드시 ROLLBACK으로 끝난다 — COMMIT은 팀장이 직접 타이핑한다.
-- =============================================================================
-- 관리자 검수 열람으로 쌓인 미완독 세션 정리 (2026-08-15)
-- 기준 B — 키키주니어의 **미완독** 세션 중 started_at 이 7일을 넘긴 것
-- =============================================================================
-- 대상 자녀: '키키주니어' child_id = 1eb93951-8a1a-4780-b1a0-6b952a0b92af
--
-- 배경 (ADR-0059 §Non-goals '원인 확정'):
--   관리자 도서 목록의 썸네일이 사용자용 리더 라우트를 그대로 열었고(커밋 5bd84c8,
--   2026-07-28), 리더가 마운트마다 세션을 만들어 미완독 2,381행이 쌓였다.
--   그 결과 마이페이지의 reading_sessions 조회가 PostgREST 상한 1,000행에 잘려
--   "읽는 중 930권"이라는 틀린 수치가 표시돼 왔다(실제 2,352권).
--
--   재발 방지는 **이 정리보다 먼저** 배포된다 — 관리자 링크에 `?preview=1`이 붙고
--   리더 3종과 startReadingSession이 그 진입에서 세션을 만들지 않는다
--   (lib/book/preview-mode.ts). 정리만 하면 다음 선별 작업에서 그대로 재발한다.
--
-- 기준 B를 고른 이유 (A안·C안 대비):
--   · A안(미완독 전량)은 최근 7일 6건까지 지운다. 그 6건은 실제 사용일 수 있다.
--   · C안(전 자녀 30일 초과)은 다른 자녀 5명의 '읽다 만 책'까지 지운다 —
--     그들은 실사용자일 수 있고 기록 손실이 화면에 보인다.
--   · B안은 A안과 효과가 거의 같으면서(2,381 → 약 2,375행) 위험이 가장 낮다.
--
-- 안전 규약:
--   · **완독 세션은 어떤 경우에도 건드리지 않는다** — 포인트·배지·'읽은 책' 목록의
--     근거다. DELETE의 WHERE에 `is_completed = false`를 명시했다.
--   · **다른 자녀 5명은 이번 범위 밖이다** — child_id 등호 조건으로 좁혔고,
--     (4)에서 무접촉을 실측으로 확인한다.
--   · 본 파일은 ROLLBACK으로 끝난다. 숫자를 확인한 뒤 **팀장이 ROLLBACK을 COMMIT으로
--     직접 고쳐** 재실행한다.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- (1) 사전 COUNT — 무엇을 지우고 무엇을 남기는지
--     기대: delete_target 약 2,375 / keep_recent 6 / keep_completed 52 / total 2,433
--     (2026-08-15 로컬 검증 중 정상 열람 1회가 발생했으므로 keep_recent 는 6 또는 7일 수
--      있다. 그 1건은 최근 7일 이내라 보존 대상이다.)
-- -----------------------------------------------------------------------------
select
  'before'                                                            as phase,
  count(*)                                                            as total,
  count(*) filter (where not rs.is_completed
                     and rs.started_at <  now() - interval '7 days')  as delete_target,
  count(*) filter (where not rs.is_completed
                     and rs.started_at >= now() - interval '7 days')  as keep_recent_in_progress,
  count(*) filter (where rs.is_completed)                             as keep_completed
from public.reading_sessions rs
where rs.child_id = '1eb93951-8a1a-4780-b1a0-6b952a0b92af'::uuid;


-- -----------------------------------------------------------------------------
-- (2) DELETE — 기준 B
--     세 조건의 AND다: 해당 자녀 / 미완독 / 7일 초과.
--     `is_completed = false`는 생략 불가 — 이 한 줄이 완독 52행을 지킨다.
-- -----------------------------------------------------------------------------
delete from public.reading_sessions as rs
where rs.child_id = '1eb93951-8a1a-4780-b1a0-6b952a0b92af'::uuid
  and rs.is_completed = false
  and rs.started_at < now() - interval '7 days';


-- -----------------------------------------------------------------------------
-- (3) 사후 COUNT — 잔존 실측
--     기대: total 약 58(= 완독 52 + 최근 미완독 6~7) / delete_target 0 /
--           keep_completed 52 (사전과 **반드시 동일**해야 한다)
-- -----------------------------------------------------------------------------
select
  'after'                                                             as phase,
  count(*)                                                            as total,
  count(*) filter (where not rs.is_completed
                     and rs.started_at <  now() - interval '7 days')  as delete_target,
  count(*) filter (where not rs.is_completed
                     and rs.started_at >= now() - interval '7 days')  as keep_recent_in_progress,
  count(*) filter (where rs.is_completed)                             as keep_completed
from public.reading_sessions rs
where rs.child_id = '1eb93951-8a1a-4780-b1a0-6b952a0b92af'::uuid;


-- -----------------------------------------------------------------------------
-- (4) 다른 자녀 무접촉 확인 — 전 자녀 잔존 요약
--     기대: 키키주니어 외 자녀의 sessions 수가 삭제 전과 동일
--           (초은우 45 · 우혀니 32 · kikikiki 4 · Ruthster 2 · Test 1).
--     이름 표기는 R6 실행 결과를 정본으로 삼는다.
-- -----------------------------------------------------------------------------
select
  c.name                                                              as child_name,
  c.id                                                                as child_id,
  count(rs.id)                                                        as sessions,
  count(rs.id) filter (where rs.is_completed)                         as completed,
  count(rs.id) filter (where not rs.is_completed)                     as in_progress
from public.children c
left join public.reading_sessions rs on rs.child_id = c.id
group by c.name, c.id
order by sessions desc, c.name;


-- =============================================================================
-- 확인 후 이 줄을 COMMIT 으로 고쳐 재실행한다 (팀장 직접 타이핑).
-- =============================================================================
ROLLBACK;
