-- =============================================================================
-- 02_rot18_pol6_state_audit.sql — 회전 18권 · 오염 6권(계 24권) 착수 전 상태 감사
--
-- 목적  : 목표 ① 잔여 24권 트랙의 착수 전 현황 확정. **쓰기문 0건 · 순수 SELECT**이므로
--         트랜잭션이 필요 없다. 반복 실행해도 안전하다.
-- 실행자: 팀장 (Supabase SQL Editor). 워커 DB 접근 금지(ADR-0058 D7-①).
-- 실행법: **전체를 한 번에 실행**한다. 결과는 단일 표 1개다.
--
-- 대상 24권의 출처 (워커 로컬 실측 2026-08-14)
-- -----------------------------------------------------------------------------
--   회전 18권 = lib/admin/review/rotation-pages.ts ROTATED_PAGES 키 18개
--               (= scripts/tts_pilot/tts_targets.py ROTATED_SLUGS, 직교회전 33면)
--   오염  6권 = scripts/tts_pilot/tts_targets.py POLLUTED_SLUGS
--   두 집합의 **교집합 0권** — 24권은 서로 겹치지 않는다(로컬 대조 확인).
--
-- ★ 식별자: 이 코호트(Book Dash 152/154)의 books.source_id는 **slug**다
--   (rotation-pages.ts:30 · ADR-0047 D1). html 39권 코호트의 UUID 방식과 다르다.
--   조인은 (source_platform, source_id) 쌍으로 건다.
-- =============================================================================

WITH target(src, cohort) AS (
  VALUES
    ('catch-that-cat', 'rotated'),
    ('how-do-you-eat', 'rotated'),
    ('how-do-you-sleep', 'rotated'),
    ('khaya-wants-to-row', 'rotated'),
    ('monkey-business', 'rotated'),
    ('my-dream-in-the-drawer', 'rotated'),
    ('pako-the-pigeon-disappears', 'rotated'),
    ('samoosas', 'rotated'),
    ('shhhhh', 'rotated'),
    ('tejus-shadow', 'rotated'),
    ('the-best-gift', 'rotated'),
    ('the-box', 'rotated'),
    ('the-monster-must-go', 'rotated'),
    ('theres-a-fire-on-the-mountain', 'rotated'),
    ('theres-an-alien-in-my-house', 'rotated'),
    ('thulis-tissue', 'rotated'),
    ('whats-happened-to-our-water', 'rotated'),
    ('you-yes-you', 'rotated'),
    ('and-also', 'polluted'),
    ('little-goat', 'polluted'),
    ('look-up', 'polluted'),
    ('the-rainbow-cloud', 'polluted'),
    ('where-is-lulu', 'polluted'),
    ('yes-you-can', 'polluted')
),
b AS (
  SELECT bk.id, bk.source_id, bk.is_active, bk.content_type, t.cohort
    FROM public.books bk
    JOIN target t ON t.src = bk.source_id
   WHERE bk.source_platform = 'book_dash'
)

-- [0] 대상 회계 (24/24 여야 정상)
SELECT 0 AS sort, '0. 회계' AS section, 'target 24권 → books 매칭' AS bucket,
       (SELECT count(*) FROM b) AS books, NULL::bigint AS rows_,
       CASE WHEN (SELECT count(*) FROM b) = 24 THEN 'PASS — 24/24'
            ELSE 'FAIL — 매칭 결손. 워커에게 전달할 것' END AS note

-- [1] books 분포
UNION ALL
SELECT 1, '1. books', b.cohort || ' · is_active=' || b.is_active::text ||
       ' · content_type=' || coalesce(b.content_type,'(null)'),
       count(*), NULL, '기대: 전원 active · html 아님(PDF 코호트)'
  FROM b GROUP BY b.cohort, b.is_active, b.content_type

-- [2] book_review status 분포
UNION ALL
SELECT 2, '2. book_review', b.cohort || ' · status=' || coalesce(r.status,'(null)'),
       count(*), NULL, '착수 전 상태. in_review면 이미 검수 중'
  FROM b LEFT JOIN public.book_review r ON r.book_id = b.id
 GROUP BY b.cohort, r.status

-- [3] book_audio 보유 — **회전권에 오디오가 있으면 재합성 차단 대상(ADR-0058 D4)**
UNION ALL
SELECT 3, '3. book_audio', b.cohort || ' · voice=' || coalesce(a.voice,'(null)'),
       count(DISTINCT a.book_id), count(*),
       '오디오 보유 권은 텍스트 수정 시 재합성 필요(ADR-0058 실행완결 §5)'
  FROM b LEFT JOIN public.book_audio a ON a.book_id = b.id
 GROUP BY b.cohort, a.voice

-- [4] book_text 행수
UNION ALL
SELECT 4, '4. book_text', b.cohort || ' · source=' || coalesce(t.source,'(null)'),
       count(DISTINCT t.book_id), count(*), '면수 합계'
  FROM b LEFT JOIN public.book_text t ON t.book_id = b.id
 GROUP BY b.cohort, t.source

-- [5] ★ 오염 잔존 실측 — DB 본문에 'Story spread N' 접두가 남아 있는 면
--     로컬 산출물(out_154) 기준 기대치: 6권 × 각 1면 = 6면
UNION ALL
SELECT 5, '5. 오염 잔존', 'text가 ''Story spread N''으로 시작하는 면',
       count(DISTINCT t.book_id), count(*),
       '기대: 6권 6면. 0이면 이미 정리됨, 초과면 목록 재산출 필요'
  FROM public.book_text t JOIN b ON b.id = t.book_id
 WHERE t.text ~ '^Story spread [0-9]+'

-- [5-b] 오염 패턴 확장 탐지 — 접두가 아닌 위치에 섞인 경우
UNION ALL
SELECT 6, '5. 오염 잔존', '접두가 아닌 위치에 ''story spread'' 포함',
       count(DISTINCT t.book_id), count(*),
       '기대: 0면. 있으면 접두 제거 스크립트로는 부족하다'
  FROM public.book_text t JOIN b ON b.id = t.book_id
 WHERE t.text ~* 'story\s+spread' AND t.text !~ '^Story spread [0-9]+'

-- [5-c] 24권 **밖**의 오염 — 목록 자체가 낡았는지 검증
UNION ALL
SELECT 7, '5. 오염 잔존', '24권 밖에서 ''story spread'' 검출',
       count(DISTINCT t.book_id), count(*),
       '기대: 0. 검출되면 POLLUTED_SLUGS 목록 갱신 필요'
  FROM public.book_text t
 WHERE t.text ~* 'story\s+spread'
   AND NOT EXISTS (SELECT 1 FROM b WHERE b.id = t.book_id)

 ORDER BY sort, bucket;
