-- 조회 전용. 쓰기 문장 없음.
-- =============================================================================
-- 마이페이지 수치 이상 진단 (2026-08-15) — SELECT 6문
-- =============================================================================
-- 대상 화면: /mypage (app/(reader)/mypage/page.tsx → lib/mypage/summary.ts)
--
-- 관측된 이상 3건:
--   ① "읽는중 930권"
--   ② "완독 45권 / 포인트 2650P" (45 x 50P = 2250P 대비 400P 초과)
--   ③ "읽은 책" 목록에 16권만 표시 (완독 45권과 불일치)
--
-- 코드 실측으로 확인된 산출식 (lib/mypage/summary.ts, 추정 아님):
--   completedCount  = reading_sessions.is_completed = true 인 행의 **book_id 종수**
--                     (재완독 중복 제거, :144-156)
--   inProgressCount = is_completed = false 이면서 그 책을 한 번도 완독하지 않은
--                     행의 **book_id 종수** (:158-165)
--   points          = children.points 원값 그대로 (:141) — 세션 집계와 무관
--                     · 적립은 lib/book/rewards.ts POINTS_PER_COMPLETION = 50 을
--                       **완독 이벤트(세션 전이)마다** 1회. 책 종수 기준이 아니다.
--   readBooks       = 완독 book_id를 completed_at DESC로 정렬 → 앞에서 20권만
--                     슬라이스(LIST_LIMIT = 20, :48/:167) → books.is_active = true
--                     인 책만 남김(:198-217). 즉 상한 20 + 비활성 탈락의 2중 축소.
--   세션 조회는 LIMIT 없음(:110-115) — PostgREST 행 상한(Supabase 기본 1000)에
--   걸리면 위 카운트가 조용히 잘린다. Q1의 sessions_total로 확인한다.
--
-- 실행 규칙:
--   - SELECT 전용. BEGIN/ROLLBACK 불필요.
--   - CREATE TEMP TABLE 금지(SQL Editor 문장 간 생존 불가) — CTE 단일 문장으로 작성.
--   - 각 Q는 독립 문장이다. 한 번에 하나씩 실행해 결과를 확인한다.
-- =============================================================================


-- =============================================================================
-- Q1. reading_sessions 를 child_id별로 집계
--     기대 대조: distinct_books_completed 가 화면의 "완독 45권"과 같아야 한다.
--     sessions_total 이 1000에 근접/도달하면 화면 카운트가 잘렸을 수 있다.
--     flag_completed_no_ts / flag_ts_no_completed 는 두 완독 표식의 불일치 행
--     (정상값은 0 — 지시서 4개 항목 외 추가분).
-- =============================================================================
select
  rs.child_id,
  c.name                                                          as child_name,
  count(*)                                                        as sessions_total,
  count(*) filter (where rs.is_completed)                         as completed_true,
  count(*) filter (where not rs.is_completed)                     as completed_false,
  count(*) filter (where rs.completed_at is null)                 as completed_at_null,
  count(distinct rs.book_id)                                      as distinct_books,
  count(distinct rs.book_id) filter (where rs.is_completed)       as distinct_books_completed,
  count(*) filter (where rs.is_completed and rs.completed_at is null)
                                                                  as flag_completed_no_ts,
  count(*) filter (where not rs.is_completed and rs.completed_at is not null)
                                                                  as flag_ts_no_completed
from public.reading_sessions rs
left join public.children c on c.id = rs.child_id
group by rs.child_id, c.name
order by sessions_total desc;


-- =============================================================================
-- Q2. 미완독(is_completed = false) 행의 started_at 분포
--     구간은 서로 겹치지 않는다: 7일 이내 / 7~30일 / 30일 초과.
--     d30_plus 가 대부분이면 과거 일괄 열람(테스트·크롤)의 잔재다.
-- =============================================================================
select
  rs.child_id,
  c.name                                                          as child_name,
  count(*)                                                        as in_progress_rows,
  count(distinct rs.book_id)                                      as in_progress_books,
  count(*) filter (where rs.started_at >= now() - interval '7 days')
                                                                  as d_0_7,
  count(*) filter (where rs.started_at <  now() - interval '7 days'
                     and rs.started_at >= now() - interval '30 days')
                                                                  as d_7_30,
  count(*) filter (where rs.started_at <  now() - interval '30 days')
                                                                  as d_30_plus,
  min(rs.started_at)                                              as oldest_started_at,
  max(rs.started_at)                                              as newest_started_at
from public.reading_sessions rs
left join public.children c on c.id = rs.child_id
where not rs.is_completed
group by rs.child_id, c.name
order by in_progress_rows desc;


-- =============================================================================
-- Q3. 미완독 행 중 pages_read = 0 또는 1 (열기만 하고 이탈한 세션)
--     주의: lib/book/reading-session.ts 는 pages_read 를 갱신하지 않는다
--     (ADR-0017 D3 — DEFAULT 0 유지). 따라서 전량 0으로 나오는 것이 정상이며,
--     그 경우 본 지표는 "이탈" 판별에 쓸 수 없다. 이 사실 자체를 확인하는 문장이다.
-- =============================================================================
select
  rs.child_id,
  c.name                                                          as child_name,
  count(*)                                                        as in_progress_rows,
  count(*) filter (where rs.pages_read = 0)                       as pages_read_0,
  count(*) filter (where rs.pages_read = 1)                       as pages_read_1,
  count(*) filter (where rs.pages_read <= 1)                      as pages_read_0_or_1,
  count(*) filter (where rs.pages_read > 1)                       as pages_read_2_plus,
  max(rs.pages_read)                                              as pages_read_max
from public.reading_sessions rs
left join public.children c on c.id = rs.child_id
where not rs.is_completed
group by rs.child_id, c.name
order by in_progress_rows desc;


-- =============================================================================
-- Q4. 동일 child_id + book_id 조합의 중복 세션 상위 20건
--     reading_sessions 에는 UNIQUE 제약이 없다(001_initial_schema.sql:121-130).
--     완독 후 같은 책을 다시 열면 미완료 세션이 새로 INSERT 되므로
--     (reading-session.ts 중복 가드 키 = completed_at IS NULL) 중복이 쌓인다.
--     completed_rows 가 2 이상인 조합이 곧 ②의 포인트 초과분이다.
-- =============================================================================
select
  rs.child_id,
  c.name                                                          as child_name,
  rs.book_id,
  b.title                                                         as book_title,
  count(*)                                                        as session_rows,
  count(*) filter (where rs.is_completed)                         as completed_rows,
  count(*) filter (where not rs.is_completed)                     as in_progress_rows,
  min(rs.started_at)                                              as first_started_at,
  max(rs.started_at)                                              as last_started_at
from public.reading_sessions rs
left join public.children c on c.id = rs.child_id
left join public.books b    on b.id = rs.book_id
group by rs.child_id, c.name, rs.book_id, b.title
having count(*) > 1
order by session_rows desc, last_started_at desc
limit 20;


-- =============================================================================
-- Q5. children.points 실제값 vs 완독 건수 x 50 의 차이
--     두 기준을 모두 낸다:
--       diff_by_session : 완독 **세션 수** 기준 (코드의 실제 적립 규칙, rewards.ts:114)
--                         → 0이면 포인트는 규칙대로 정확하고, 화면의 "45권"이
--                           책 종수라서 생긴 정의 차이일 뿐이다(=②는 버그 아님).
--       diff_by_book    : 완독 **책 종수** 기준 (화면 표시와 동일한 정의)
--                         → 2650 - 45x50 = +400 의 재현 여부.
--     diff_by_session 이 0이 아니면 적립 경로 밖의 포인트 유입이 있다는 뜻이다.
-- =============================================================================
select
  c.id                                                            as child_id,
  c.name                                                          as child_name,
  c.points                                                        as points_actual,
  count(rs.id) filter (where rs.is_completed)                     as completed_sessions,
  50 * count(rs.id) filter (where rs.is_completed)                as points_expected_by_session,
  c.points - 50 * count(rs.id) filter (where rs.is_completed)     as diff_by_session,
  count(distinct rs.book_id) filter (where rs.is_completed)       as completed_books,
  50 * count(distinct rs.book_id) filter (where rs.is_completed)  as points_expected_by_book,
  c.points - 50 * count(distinct rs.book_id) filter (where rs.is_completed)
                                                                  as diff_by_book
from public.children c
left join public.reading_sessions rs on rs.child_id = c.id
group by c.id, c.name, c.points
order by c.name;


-- =============================================================================
-- Q6. 완독 도서의 book_review.status / book_audio 보유 / books.is_active 분포
--     검수·테스트 열람이 섞였는지 판별용.
--     in_recent_top20 = 화면 "읽은 책" 목록이 실제로 후보로 삼는 상위 20권
--       (completed_at 최신순, LIST_LIMIT = 20). 추가 컬럼이며 지시서 항목 외다 —
--       ③의 확정에 필요하다: in_recent_top20 = true 이면서 is_active = false 인
--       권수가 4면, 20 - 4 = 16 으로 화면 표시 권수가 정확히 설명된다.
-- =============================================================================
with completed_books as (
  select
    rs.child_id,
    rs.book_id,
    max(rs.completed_at) as last_completed_at
  from public.reading_sessions rs
  where rs.is_completed
  group by rs.child_id, rs.book_id
),
ranked as (
  select
    cb.child_id,
    cb.book_id,
    cb.last_completed_at,
    row_number() over (
      partition by cb.child_id
      order by cb.last_completed_at desc nulls last
    ) as recent_rank
  from completed_books cb
),
labeled as (
  select
    r.child_id,
    r.book_id,
    (r.recent_rank <= 20)                                         as in_recent_top20,
    coalesce(br.status, '(book_review 행 없음)')                  as review_status,
    b.is_active,
    exists (
      select 1 from public.book_audio ba where ba.book_id = r.book_id
    )                                                             as has_audio
  from ranked r
  left join public.books b        on b.id = r.book_id
  left join public.book_review br on br.book_id = r.book_id
)
select
  l.child_id,
  c.name                                                          as child_name,
  l.in_recent_top20,
  l.review_status,
  l.is_active,
  l.has_audio,
  count(*)                                                        as books
from labeled l
left join public.children c on c.id = l.child_id
group by l.child_id, c.name, l.in_recent_top20, l.review_status, l.is_active, l.has_audio
order by l.child_id, l.in_recent_top20 desc, books desc;
