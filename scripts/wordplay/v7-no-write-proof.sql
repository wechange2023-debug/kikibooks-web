-- ADR-0065 §검증 계획 V7 — 무기록(D1) 증명용 대조 쿼리 (읽기 전용).
--
-- 사용법: 퀴즈 완주 **직전**에 1회, **직후**에 1회 실행해 결과를 비교한다.
--         모든 값이 완전히 동일해야 통과다. 하나라도 달라지면 무기록 원칙 위반이다.
--
-- ※ 본 파일은 SELECT만 포함한다. INSERT/UPDATE/DELETE 0건.
-- ※ 실행은 팀장 육안 검수 시점에 함께 한다(E-2b 지시서 l).

-- (1) 자녀 단위 기록 3종의 행수
SELECT 'reading_sessions' AS table_name, COUNT(*) AS row_count FROM reading_sessions
UNION ALL
SELECT 'children',     COUNT(*) FROM children
UNION ALL
SELECT 'child_badges', COUNT(*) FROM child_badges
ORDER BY table_name;

-- (2) 포인트 총합·자녀별 값 (퀴즈가 포인트를 건드리지 않았음을 증명)
SELECT id, name, points, current_level, updated_at
FROM children
ORDER BY id;

-- (3) 배지 전량 (퀴즈가 배지를 부여하지 않았음을 증명)
SELECT child_id, badge_code, earned_at
FROM child_badges
ORDER BY child_id, badge_code;

-- (4) 읽기 세션 요약 (퀴즈가 세션을 만들거나 완독 상태를 바꾸지 않았음을 증명)
SELECT
  COUNT(*)                                  AS total_sessions,
  COUNT(*) FILTER (WHERE is_completed)       AS completed,
  COUNT(*) FILTER (WHERE completed_at IS NULL) AS in_progress,
  MAX(started_at)                            AS latest_started,
  MAX(completed_at)                          AS latest_completed
FROM reading_sessions;

-- (5) 혹시 모를 신규 테이블 유입 감시 — 퀴즈용 테이블이 생기지 않았는지 확인
--     (ADR-0065 D1: 신규 테이블 0건)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
