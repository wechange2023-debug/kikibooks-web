-- =============================================================================
-- 01_html39_state_audit.sql — Book Dash html 39권 현재 상태 확정 (읽기 전용)
--
-- 목적  : 세로스크롤 54권 트랙 재개 판단용 실측. **쓰기문 0건 · 순수 SELECT**이므로
--         트랜잭션이 필요 없다(BEGIN/ROLLBACK 없음). 반복 실행해도 안전하다.
-- 실행자: 팀장 (Supabase SQL Editor). 워커 DB 접근 금지(ADR-0053 D6-① / ADR-0058 D7-①).
-- 실행법: **전체를 한 번에 실행**한다. 결과는 단일 표 1개다(마지막 SELECT 1문장뿐).
--
-- 대상 39권의 구성 근거
-- -----------------------------------------------------------------------------
--   54  content_type='html' 전량 (scripts/pdf_harvest/longscroll_check_urls.csv 54행)
--  −15  blacklist (lib/shared/blacklist.ts BOOK_DASH_404_SOURCE_IDS)
--  = 39  ← 본 쿼리의 대상 (= ADR-0054 D1 '사용자 노출 코호트 39' = ADR-0056 '활성 39권')
--         내역 = html38_slugs.txt 38권 + maddy-moona 1권(ADR-0054 D1-b hold)
--
--   워커 로컬 실측(2026-08-14)으로 회계가 닫힘을 확인했다:
--     · 39권 ∩ blacklist 15권 = **0건**
--     · CSV 54 − 대상 39 = 15권이며, 그 15권 전원이 blacklist UUID와 1:1 일치
--   즉 아래 목록은 blacklist를 **빠짐없이, 그리고 그것만** 제외한 집합이다.
--
-- ★ 식별자 주의: Book Dash html 코호트의 books.source_id는 **UUID**다
--   (meta.yml identifier — sync_book_dash.py:152). PDF 152/154 코호트의 slug 방식과 다르다.
--   조인 키는 **(source_platform, source_id) 쌍**이며 source_id 단독 비교를 하지 않는다
--   (gen_book_text_sql_v2.py:29 규약).
-- =============================================================================

WITH target(src) AS (
  VALUES
    ('9c9e94e0-fe46-11e5-86aa-5e5517507c66'),  -- a-beautiful-day
    ('9c9e8586-fe46-11e5-86aa-5e5517507c66'),  -- a-dancers-tale
    ('9c9e6754-fe46-11e5-86aa-5e5517507c66'),  -- a-fish-and-a-gift
    ('9c9e72e4-fe46-11e5-86aa-5e5517507c66'),  -- a-house-for-mouse
    ('9c9e7a6e-fe46-11e5-86aa-5e5517507c66'),  -- a-tiny-seed
    ('9c9e7b9a-fe46-11e5-86aa-5e5517507c66'),  -- amazing-daisy
    ('9c9e86da-fe46-11e5-86aa-5e5517507c66'),  -- bathtub-safari
    ('9c9e7820-fe46-11e5-86aa-5e5517507c66'),  -- come-back-cat
    ('9c9e71cc-fe46-11e5-86aa-5e5517507c66'),  -- gracas-dream
    ('9c9e6524-fe46-11e5-86aa-5e5517507c66'),  -- grandpas-gold
    ('9c9e819e-fe46-11e5-86aa-5e5517507c66'),  -- how-about-you
    ('9c9e9396-fe46-11e5-86aa-5e5517507c66'),  -- i-will-help-you
    ('9c9e8c0c-fe46-11e5-86aa-5e5517507c66'),  -- is-there-anyone-like-me
    ('9c9e9e5e-fe46-11e5-86aa-5e5517507c66'),  -- karabos-question
    ('9c9f566e-fe46-11e5-86aa-5e5517507c66'),  -- lara-the-yellow-ladybird
    ('9c9e55de-fe46-11e5-86aa-5e5517507c66'),  -- little-ants-big-plan
    ('9c9e96ac-fe46-11e5-86aa-5e5517507c66'),  -- londi-the-dreaming-girl
    ('9c9e83b0-fe46-11e5-86aa-5e5517507c66'),  -- lory-dory
    ('9c9e7dca-fe46-11e5-86aa-5e5517507c66'),  -- maddy-moona
    ('9c9e6196-fe46-11e5-86aa-5e5517507c66'),  -- miss-helens-magical-world
    ('9c9e640c-fe46-11e5-86aa-5e5517507c66'),  -- queen-of-soweto
    ('9c9e6e52-fe46-11e5-86aa-5e5517507c66'),  -- rafikis-style
    ('9c9e9fc6-fe46-11e5-86aa-5e5517507c66'),  -- sbus-special-shoes
    ('9c9e76ea-fe46-11e5-86aa-5e5517507c66'),  -- searching-for-the-spirit-of-spring
    ('9c9ea96c-fe46-11e5-86aa-5e5517507c66'),  -- sima-and-siza
    ('9c9ea21e-fe46-11e5-86aa-5e5517507c66'),  -- sindi-and-the-moon
    ('9c9e596c-fe46-11e5-86aa-5e5517507c66'),  -- sindiwe-and-the-fireflies
    ('9c9e62ea-fe46-11e5-86aa-5e5517507c66'),  -- singing-the-truth
    ('9c9e87f2-fe46-11e5-86aa-5e5517507c66'),  -- sizwes-smile
    ('9c9e7cb2-fe46-11e5-86aa-5e5517507c66'),  -- sleepy-mr-sloth
    ('9c9eb68c-fe46-11e5-86aa-5e5517507c66'),  -- thatos-birthday-surprise
    ('9c9ea48a-fe46-11e5-86aa-5e5517507c66'),  -- there-must-be-a-rainbow
    ('9c9e663c-fe46-11e5-86aa-5e5517507c66'),  -- together-were-strong
    ('9c9e6f9c-fe46-11e5-86aa-5e5517507c66'),  -- tortoise-finds-his-home
    ('9c9e9102-fe46-11e5-86aa-5e5517507c66'),  -- walking-together
    ('9c9f3292-fe46-11e5-86aa-5e5517507c66'),  -- what-if
    ('9c9eb2cc-fe46-11e5-86aa-5e5517507c66'),  -- whose-button-is-this
    ('9c9e5f48-fe46-11e5-86aa-5e5517507c66'),  -- why-is-nita-upside-down
    ('9c9e6d12-fe46-11e5-86aa-5e5517507c66')   -- zanele-situ-my-story
),
b AS (   -- 대상 39권의 books 행 (조인 키 = 플랫폼 + source_id 쌍)
  SELECT bk.id, bk.source_id, bk.is_active, bk.content_type
    FROM public.books bk
    JOIN target t ON t.src = bk.source_id
   WHERE bk.source_platform = 'book_dash'
)

-- [0] 대상 회계 — 목록 39권이 books에 몇 행으로 잡히는가 (39/39 여야 정상)
SELECT 0 AS sort,
       '0. 대상 회계'                                   AS section,
       'target 목록 39권 → books 매칭'                  AS bucket,
       (SELECT count(*) FROM b)                         AS books,
       NULL::bigint                                     AS rows_,
       CASE WHEN (SELECT count(*) FROM b) = 39
            THEN 'PASS — 39/39 매칭'
            ELSE 'FAIL — 매칭 결손. 워커에게 전달할 것'
       END                                              AS note

-- [1] books 분포 — is_active × content_type
UNION ALL
SELECT 1, '1. books',
       'is_active=' || b.is_active::text ||
       ' · content_type=' || coalesce(b.content_type, '(null)'),
       count(*), NULL,
       '기대: is_active=true · content_type=html 39권'
  FROM b GROUP BY b.is_active, b.content_type

-- [2] book_text — source 라벨별 권수·행수(=면수)
UNION ALL
SELECT 2, '2. book_text',
       'source=' || coalesce(t.source, '(null)'),
       count(DISTINCT t.book_id), count(*),
       '기대: html_scene_json_v1 39권 469행 (ADR-0056 D9)'
  FROM public.book_text t JOIN b ON b.id = t.book_id
 GROUP BY t.source

-- [2-b] book_text 미보유 권수
UNION ALL
SELECT 3, '2. book_text', 'book_text 0행인 권',
       count(*), NULL,
       '기대: 0권 (ADR-0056 적재 후 결손 0)'
  FROM b
 WHERE NOT EXISTS (SELECT 1 FROM public.book_text t WHERE t.book_id = b.id)

-- [3] book_review — status 분포
UNION ALL
SELECT 4, '3. book_review',
       'status=' || coalesce(r.status, '(null)'),
       count(*), NULL,
       '기대: 5상태 중 하나. ADR-0058 D5로 860권 시드됨'
  FROM public.book_review r JOIN b ON b.id = r.book_id
 GROUP BY r.status

-- [3-b] book_review 미시드 권수
UNION ALL
SELECT 5, '3. book_review', 'book_review 행 없는 권',
       count(*), NULL,
       '기대: 0권 (ADR-0058 D5 시드 이후)'
  FROM b
 WHERE NOT EXISTS (SELECT 1 FROM public.book_review r WHERE r.book_id = b.id)

-- [4] book_audio — voice별 권수·행수 (0행이 정상)
UNION ALL
SELECT 6, '4. book_audio',
       'voice=' || coalesce(a.voice, '(null)') || ' · kind=' || coalesce(a.kind, '(null)'),
       count(DISTINCT a.book_id), count(*),
       '기대: 0건. 행이 있으면 재합성 차단 대상(ADR-0058 D4)'
  FROM public.book_audio a JOIN b ON b.id = a.book_id
 GROUP BY a.voice, a.kind

-- [4-b] book_audio 총계 — 0 확인용 (위 [4]는 0건이면 행 자체가 안 나오므로 별도로 낸다)
UNION ALL
SELECT 7, '4. book_audio', '총계(전 voice)',
       (SELECT count(DISTINCT a.book_id) FROM public.book_audio a JOIN b ON b.id = a.book_id),
       (SELECT count(*) FROM public.book_audio a JOIN b ON b.id = a.book_id),
       CASE WHEN (SELECT count(*) FROM public.book_audio a JOIN b ON b.id = a.book_id) = 0
            THEN 'PASS — 0행 (예상대로)'
            ELSE 'CHECK — 오디오 보유 권이 있다. ADR-0056 D9-a Ruth 34권 여부 확인'
       END

 ORDER BY sort, bucket;
