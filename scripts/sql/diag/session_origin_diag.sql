-- 조회 전용. 쓰기 문장 없음.
-- =============================================================================
-- 미완독 세션 2,381행 원인 특정 (2026-08-15) — SELECT 7문 + 삭제 기준 카운트 1문
-- =============================================================================
-- 대상: children.name = '키키주니어' (child_id = 1eb93951-8a1a-4780-b1a0-6b952a0b92af)
--       reading_sessions 2,433행 = 완독 52 + 미완독 2,381
--
-- G-1 코드 실측(추정 아님)이 먼저 좁혀 놓은 사실:
--   · 세션 INSERT는 리더 컴포넌트 3종(html-reader:115 / audio-reader:502 / asb-reader:168)의
--     **마운트 useEffect**에서만 일어난다. 세 컴포넌트를 import 하는 곳은
--     app/(reader)/book/[id]/read/page.tsx **한 곳뿐**이다.
--   · 쇼케이스(/showcase/*)는 카드가 /book/{id}(상세)로만 링크한다 — 세션 INSERT 0.
--   · 관리자 검수(/admin/review, /admin/review/[bookId])는 리더 컴포넌트·리더 링크 0건 —
--     세션 INSERT 0.
--   · **그러나 관리자 도서 목록**(components/admin/books/admin-books-browser.tsx:199-202)의
--     썸네일이 `/book/{id}/read`를 `target="_blank"`로 연다. 이 경로는 일반 리더를 그대로
--     띄우므로 **세션이 만들어진다**. 해당 링크는 커밋 `5bd84c8`(**2026-07-28**)에서 도입됐다.
--   · 따라서 판별의 핵심은 **2026-07-28 전후 분포**다(R7) — 이후에 몰려 있으면 관리자 목록
--     동선, 이전에도 많으면 홈·상세를 사람이 직접 클릭한 동선이다.
--
-- 실행 규칙:
--   - SELECT 전용. BEGIN/ROLLBACK 불필요. DELETE/UPDATE 문장 0건.
--   - CREATE TEMP TABLE 금지(SQL Editor 문장 간 생존 불가) — 필요한 곳은 CTE 단일 문장.
--   - 각 R은 독립 문장이다. 한 번에 하나씩 실행해 결과를 확인한다.
--   - 시각은 전부 Asia/Seoul 기준으로 환산해 출력한다.
-- =============================================================================


-- =============================================================================
-- R1. 미완독 책 집합 vs 활성 도서 전체 집합
--     선별(전수 열람) 가설이면 opened_active 가 active_books_total 에 근접하고
--     active_not_opened 가 작아진다. 반대로 아이가 고른 책만 열었다면 크게 벌어진다.
-- =============================================================================
with in_progress as (
  select distinct rs.book_id
  from public.reading_sessions rs
  where rs.child_id = '1eb93951-8a1a-4780-b1a0-6b952a0b92af'::uuid
    and not rs.is_completed
)
select
  (select count(*) from in_progress)                                   as in_progress_books,
  (select count(*) from public.books where is_active)                  as active_books_total,
  (select count(*) from in_progress ip
     join public.books b on b.id = ip.book_id and b.is_active)         as opened_active,
  (select count(*) from public.books b
    where b.is_active
      and not exists (select 1 from in_progress ip where ip.book_id = b.id))
                                                                       as active_not_opened,
  (select count(*) from in_progress ip
     join public.books b on b.id = ip.book_id
    where not b.is_active)                                             as opened_but_inactive;


-- =============================================================================
-- R2. 미완독 책의 source_platform 분포 + 플랫폼별 활성 도서 대비 열람률
--     선별이면 전 플랫폼에 고르게 퍼지고 coverage_pct 가 플랫폼 간 비슷해진다.
--     특정 플랫폼만 높으면 그 플랫폼 작업 중에 생긴 흔적이다.
-- =============================================================================
with in_progress as (
  select distinct rs.book_id
  from public.reading_sessions rs
  where rs.child_id = '1eb93951-8a1a-4780-b1a0-6b952a0b92af'::uuid
    and not rs.is_completed
)
select
  coalesce(b.source_platform, '(null)')                                as source_platform,
  count(*)                                                             as opened_books,
  count(*) filter (where b.is_active)                                  as opened_active,
  (select count(*) from public.books b2
    where b2.source_platform is not distinct from b.source_platform
      and b2.is_active)                                                as active_books_total,
  round(
    100.0 * count(*) filter (where b.is_active)
    / nullif((select count(*) from public.books b3
               where b3.source_platform is not distinct from b.source_platform
                 and b3.is_active), 0)
  , 1)                                                                 as coverage_pct
from in_progress ip
join public.books b on b.id = ip.book_id
group by b.source_platform
order by opened_books desc;


-- =============================================================================
-- R3. started_at 일(day, KST) 버킷 상위 20일
--     사람이 손으로 열었다면 작업일마다 수십~수백 건으로 퍼진다.
--     스크립트/헤드리스라면 하루에 수천 건이 몰린다.
--     books = 그날 열린 책 종수. sessions 와 같으면 그날 중복 열람이 0이다.
-- =============================================================================
select
  (rs.started_at at time zone 'Asia/Seoul')::date                      as day_kst,
  count(*)                                                             as sessions,
  count(distinct rs.book_id)                                           as books,
  min(rs.started_at at time zone 'Asia/Seoul')                         as first_kst,
  max(rs.started_at at time zone 'Asia/Seoul')                         as last_kst
from public.reading_sessions rs
where rs.child_id = '1eb93951-8a1a-4780-b1a0-6b952a0b92af'::uuid
  and not rs.is_completed
group by 1
order by sessions desc
limit 20;


-- =============================================================================
-- R4. R3 상위 2일을 시(hour, KST) 단위로 분해
--     사람이면 근무 시간대에 넓게 퍼지고 시간당 건수가 들쭉날쭉하다.
--     스크립트면 1~2시간에 응축되고 시간당 건수가 평평하다.
--     span_seconds = 그 시간대 첫 건과 마지막 건의 간격(초).
-- =============================================================================
with ip as (
  select rs.book_id, rs.started_at
  from public.reading_sessions rs
  where rs.child_id = '1eb93951-8a1a-4780-b1a0-6b952a0b92af'::uuid
    and not rs.is_completed
),
day_rank as (
  select
    (started_at at time zone 'Asia/Seoul')::date as day_kst,
    count(*)                                     as sessions,
    row_number() over (order by count(*) desc)   as rn
  from ip
  group by 1
)
select
  d.day_kst,
  extract(hour from (ip.started_at at time zone 'Asia/Seoul'))::int    as hour_kst,
  count(*)                                                             as sessions,
  count(distinct ip.book_id)                                           as books,
  extract(epoch from (max(ip.started_at) - min(ip.started_at)))::int    as span_seconds
from ip
join day_rank d
  on d.day_kst = (ip.started_at at time zone 'Asia/Seoul')::date
where d.rn <= 2
group by d.day_kst, 2
order by d.day_kst, hour_kst;


-- =============================================================================
-- R5. 최근 7일 미완독 세션 상세 (Q2의 d_0_7 = 6건)
--     이 6건은 실제 사용일 수 있어 일괄 삭제에서 분리 검토가 필요하다.
-- =============================================================================
select
  rs.id                                                                as session_id,
  rs.book_id,
  b.title                                                              as book_title,
  b.source_platform,
  b.is_active,
  rs.started_at at time zone 'Asia/Seoul'                              as started_kst,
  rs.pages_read
from public.reading_sessions rs
left join public.books b on b.id = rs.book_id
where rs.child_id = '1eb93951-8a1a-4780-b1a0-6b952a0b92af'::uuid
  and not rs.is_completed
  and rs.started_at >= now() - interval '7 days'
order by rs.started_at desc;


-- =============================================================================
-- R6. children 을 parent_id별로 집계 (H-2 — ADR-0059 O-6 해소)
--     getActiveChild(lib/home/active-child.ts:47-64)는
--       parent_id = 로그인 사용자 → created_at ASC LIMIT 1
--     이므로, shown_child 열이 그 부모로 로그인했을 때 **화면에 보이는 자녀**다.
--     children 총 10명 중 세션 보유 6명 / 세션 0인 4명(Lala·훌·test kiki·테스트 키키).
-- =============================================================================
select
  c.parent_id,
  count(*)                                                             as children_count,
  (array_agg(c.name order by c.created_at, c.id))[1]                   as shown_child,
  string_agg(
    c.name || ' [' || to_char(c.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI')
           || ' · ' || c.points::text || 'P]',
    '  |  ' order by c.created_at, c.id
  )                                                                    as children_in_created_order,
  sum(
    (select count(*) from public.reading_sessions rs where rs.child_id = c.id)
  )                                                                    as sessions_total
from public.children c
group by c.parent_id
order by children_count desc, sessions_total desc;


-- =============================================================================
-- R7. 관리자 목록 → 리더 링크 도입(커밋 5bd84c8, 2026-07-28) 전후 분할
--     ★ 지시서 항목 외 추가분 — G-1 코드 실측에서 나온 판별축이다.
--     before_2026_07_28 이 크면 관리자 목록 동선으로는 설명되지 않는다
--     (홈·상세를 사람이 직접 클릭한 흔적). after 가 대부분이면 관리자 동선이 유력하다.
-- =============================================================================
select
  case
    when (rs.started_at at time zone 'Asia/Seoul')::date < date '2026-07-28'
      then 'before_2026_07_28'
    else 'on_or_after_2026_07_28'
  end                                                                  as era,
  count(*)                                                             as sessions,
  count(distinct rs.book_id)                                           as books,
  min(rs.started_at at time zone 'Asia/Seoul')                         as first_kst,
  max(rs.started_at at time zone 'Asia/Seoul')                         as last_kst
from public.reading_sessions rs
where rs.child_id = '1eb93951-8a1a-4780-b1a0-6b952a0b92af'::uuid
  and not rs.is_completed
group by 1
order by 1;


-- =============================================================================
-- C1. 삭제 기준 후보별 대상 건수 (G-4 — 세는 것만. DELETE 문장은 쓰지 않는다)
-- =============================================================================
--   기준 A — 키키주니어의 미완독 세션 **전량**
--     · 검수 흔적이라는 가설이 맞으면 손실 0. 가장 단순하고 절단이 즉시 소멸한다.
--     · 위험: 최근 7일 6건(R5)이 실제 사용이면 그것까지 지운다. 손실은 작지만 0은 아니다.
--   기준 B — 키키주니어의 미완독 세션 중 **started_at < now() - 7일**
--     · A에서 R5의 6건만 남긴다. 위험이 A보다 낮고 효과는 거의 같다(2,381 대 약 2,375).
--     · 위험: 7일이라는 경계에 근거가 없다. R3·R7 결과를 보고 날짜를 고정하는 편이 낫다.
--   기준 C — **전 자녀**의 미완독 세션 중 started_at < now() - 30일
--     · 다른 자녀(초은우 45 · 우혀니 32 등)의 오래된 미완독까지 정리한다.
--     · 위험: **다른 자녀는 실제 사용자일 수 있다.** '읽다 만 책'을 지우는 것이므로
--       기록 손실이 사용자에게 보인다. 키키주니어 외 계정에는 권장하지 않는다.
--
--   어느 기준도 완독 세션(is_completed = true)은 건드리지 않는다 — 포인트·배지·
--   '읽은 책' 목록의 근거이기 때문이다.
-- =============================================================================
select
  'A. 키키주니어 미완독 전량'                                          as criterion,
  count(*)                                                             as rows_to_delete,
  count(distinct rs.book_id)                                           as books_affected,
  min(rs.started_at at time zone 'Asia/Seoul')                         as oldest_kst,
  max(rs.started_at at time zone 'Asia/Seoul')                         as newest_kst
from public.reading_sessions rs
where rs.child_id = '1eb93951-8a1a-4780-b1a0-6b952a0b92af'::uuid
  and not rs.is_completed
union all
select
  'B. 키키주니어 미완독 중 7일 초과',
  count(*),
  count(distinct rs.book_id),
  min(rs.started_at at time zone 'Asia/Seoul'),
  max(rs.started_at at time zone 'Asia/Seoul')
from public.reading_sessions rs
where rs.child_id = '1eb93951-8a1a-4780-b1a0-6b952a0b92af'::uuid
  and not rs.is_completed
  and rs.started_at < now() - interval '7 days'
union all
select
  'C. 전 자녀 미완독 중 30일 초과',
  count(*),
  count(distinct rs.book_id),
  min(rs.started_at at time zone 'Asia/Seoul'),
  max(rs.started_at at time zone 'Asia/Seoul')
from public.reading_sessions rs
where not rs.is_completed
  and rs.started_at < now() - interval '30 days'
union all
select
  'C-참고. 위 C 중 키키주니어가 아닌 자녀분',
  count(*),
  count(distinct rs.book_id),
  min(rs.started_at at time zone 'Asia/Seoul'),
  max(rs.started_at at time zone 'Asia/Seoul')
from public.reading_sessions rs
where not rs.is_completed
  and rs.started_at < now() - interval '30 days'
  and rs.child_id <> '1eb93951-8a1a-4780-b1a0-6b952a0b92af'::uuid;
