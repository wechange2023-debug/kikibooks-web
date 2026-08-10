-- 목적: book_text 페이지 단위 본문 적재 (bloom · 이 파일: 2of2)
-- 실행자: 팀장(Supabase SQL Editor). 워커 초안. 워커 DB 직접 쓰기 금지.
-- 근거 ADR: ADR-0056 (ADR-0056 D1·D2·D4·D5) · Accepted 2026-08-10
-- source 라벨: manifest_txt_v1
-- 이 파일 담당: 5권 / 55행 (정제 후 빈 면 14행 포함 — D7)
-- 생성기: scripts/tts_pilot/gen_book_text_sql_v2.py
-- 매핑: page_index = (P번호|json page) - 1 (0-based, D2/D11). blocks = NULL(원천에 블록 정보 없음).
-- 정제: tts_targets.sanitize() 공유(D6). 표지 행 없음(D3).
-- 인용: $$ 달러 인용. 생성 시 '$$' 포함·'$' 종결 전수 가드 통과.
-- 중복: ON CONFLICT (book_id, page_index) DO NOTHING — 기존 행을 덮어쓰지 않는다.
--
-- ★ 이 파일은 ROLLBACK; 으로 끝난다. [적재검증]까지 기대값과 일치하면
--   마지막 ROLLBACK; 을 COMMIT; 으로 직접 바꿔 타이핑해 확정한다.

-- ───────── [선검증] 트랜잭션 밖 ─────────
-- (a) 대상 권의 기존 book_text 행 수 — 기대 0. 0이 아니면 중단하고 보고할 것.
SELECT count(*) AS rows_before FROM book_text bt
  JOIN books b ON b.id = bt.book_id
  WHERE b.source_platform='bloom' AND b.source_id IN ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc', '8d7d0cee-5d21-41b3-92c4-aaf741bb6947', 'a44e50a7-1b1d-4861-a066-4efda45b1b72', 'aa66ad93-d1a3-4f4e-996c-3b98d7b77765', 'cb1d0cee-1203-48a0-96ee-176ef8f3f6d8');
-- (b) 대상 source_id 중 books에 존재하는 권 수 — 기대 5
SELECT count(*) AS books_found FROM books
  WHERE source_platform='bloom' AND source_id IN ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc', '8d7d0cee-5d21-41b3-92c4-aaf741bb6947', 'a44e50a7-1b1d-4861-a066-4efda45b1b72', 'aa66ad93-d1a3-4f4e-996c-3b98d7b77765', 'cb1d0cee-1203-48a0-96ee-176ef8f3f6d8');

-- ───────── [적재] ─────────
BEGIN;
INSERT INTO book_text (book_id, page_index, text, blocks, source)
SELECT b.id, v.page_index, v.text, NULL::jsonb, $$manifest_txt_v1$$
  FROM (VALUES
    ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc', 0, $$Mother Sun decided to visit her sister, the moon. Sister Moon lives on the other side of the sky. “I will be back soon,” said Sun to the clouds.$$),
    ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc', 1, $$When Sun left, the mountains put on their white scarves.$$),
    ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc', 2, $$Wind had an argument with the trees. The trees became angry. They threw their leaves all over the place.$$),
    ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc', 3, $$The sky started to grumble. She turned grey.$$),
    ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc', 4, $$The clouds were sad to see all this. They started crying. There were many tears.$$),
    ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc', 5, $$The whole world began to sink under water.$$),
    ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc', 6, $$Meanwhile,on the other side of the sky, Sun was ready to leave her sister. She kissed the moon goodbye and went home.$$),
    ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc', 7, $$Sky was so happy to see Sun that she turned bright blue. The mountains put on their pretty green dresses.$$),
    ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc', 8, $$The wind went to sleep. The trees stretched their branches and smiled.$$),
    ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc', 9, $$The clouds were very happy to see mother Sun again. They went away to play.$$),
    ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc', 10, $$Lotsof little plants popped out of the earth to say, “Hello. ” The whole world sparkled.$$),
    ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc', 11, $$Mother Sun shone her light everywhere. “I told you I would be back,”she beamed.$$),
    ('8d7d0cee-5d21-41b3-92c4-aaf741bb6947', 0, $$She is carrying the bucket.$$),
    ('8d7d0cee-5d21-41b3-92c4-aaf741bb6947', 1, $$He is driving the car.$$),
    ('8d7d0cee-5d21-41b3-92c4-aaf741bb6947', 2, $$One of them is running and the other is chasing him.$$),
    ('8d7d0cee-5d21-41b3-92c4-aaf741bb6947', 3, $$He is rolling the hoop.$$),
    ('8d7d0cee-5d21-41b3-92c4-aaf741bb6947', 4, $$He is spinning the top.$$),
    ('8d7d0cee-5d21-41b3-92c4-aaf741bb6947', 5, $$One of them is throwing the ball and the other is catching it.$$),
    ('8d7d0cee-5d21-41b3-92c4-aaf741bb6947', 6, $$One of them is playing and the other is watching.$$),
    ('8d7d0cee-5d21-41b3-92c4-aaf741bb6947', 7, $$Two girls are twirling the rope. One girl is jumping the rope.$$),
    ('8d7d0cee-5d21-41b3-92c4-aaf741bb6947', 8, $$He is kicking the ball.$$),
    ('8d7d0cee-5d21-41b3-92c4-aaf741bb6947', 9, $$She is dancing.$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 0, $$What is my favorite color? I see a red apple, a red truck, and a red skirt.$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 1, $$$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 2, $$$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 3, $$What is my favorite color? I see a pumpkin, an orange cap, and a juicy orange.$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 4, $$$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 5, $$$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 6, $$What is my favorite color? I see a lemon, a yellow shirt, and a yellow pepper. My favorite color is YELLOW.$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 7, $$$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 8, $$$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 9, $$What is my favorite color? I see green grass, a green pencil, and a green pepper.$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 10, $$$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 11, $$$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 12, $$$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 13, $$What is my favorite color? I see a blue bird, a blue pencil, a blue shirt, and blue flowers. My favorite color is BLUE.$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 14, $$$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 15, $$$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 16, $$$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 17, $$What is my favorite color? I see sweet purple grapes, an eggplant, and pretty purple flowers.$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 18, $$$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 19, $$$$),
    ('a44e50a7-1b1d-4861-a066-4efda45b1b72', 20, $$What is my favorite color? I see a beautiful rainbow.$$),
    ('aa66ad93-d1a3-4f4e-996c-3b98d7b77765', 0, $$Clouds can bring rain. I like clouds.$$),
    ('aa66ad93-d1a3-4f4e-996c-3b98d7b77765', 1, $$Clouds can bring snow. I like clouds.$$),
    ('aa66ad93-d1a3-4f4e-996c-3b98d7b77765', 2, $$Clouds can hide the sun. I like clouds.$$),
    ('aa66ad93-d1a3-4f4e-996c-3b98d7b77765', 3, $$Clouds can hide the stars. I like clouds.$$),
    ('cb1d0cee-1203-48a0-96ee-176ef8f3f6d8', 0, $$This is a girl called Nora. Her doll’s name is Sarah.$$),
    ('cb1d0cee-1203-48a0-96ee-176ef8f3f6d8', 1, $$Nora loves her doll very much. They eat together every day.$$),
    ('cb1d0cee-1203-48a0-96ee-176ef8f3f6d8', 2, $$One day, Nora could not find her doll. She looked everywhere, but could not find Sarah.$$),
    ('cb1d0cee-1203-48a0-96ee-176ef8f3f6d8', 3, $$Nora did not know that her mother took Sarah for washing. She hung up the doll to dry.$$),
    ('cb1d0cee-1203-48a0-96ee-176ef8f3f6d8', 4, $$“I can’t find my doll,” cried Nora. Her mother said, “Don’t worry. I took Sarah to wash her. She will be back tonight. "$$),
    ('cb1d0cee-1203-48a0-96ee-176ef8f3f6d8', 5, $$That evening, Nora's mother gave the doll to her. The doll was very clean. Sarah looked like a new doll!$$),
    ('cb1d0cee-1203-48a0-96ee-176ef8f3f6d8', 6, $$Nora was very happy. She jumped up and down. She danced, and she laughed out loud.$$),
    ('cb1d0cee-1203-48a0-96ee-176ef8f3f6d8', 7, $$And she said thank you to her mama.$$)
  ) AS v(source_id, page_index, text)
  JOIN books b
    ON b.source_platform = 'bloom' AND b.source_id = v.source_id
ON CONFLICT (book_id, page_index) DO NOTHING;

-- ───────── [적재검증] 트랜잭션 안 ─────────
-- (c) 적재 후 행 수 — 기대 55
SELECT count(*) AS rows_after FROM book_text bt
  JOIN books b ON b.id = bt.book_id
  WHERE b.source_platform='bloom' AND b.source_id IN ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc', '8d7d0cee-5d21-41b3-92c4-aaf741bb6947', 'a44e50a7-1b1d-4861-a066-4efda45b1b72', 'aa66ad93-d1a3-4f4e-996c-3b98d7b77765', 'cb1d0cee-1203-48a0-96ee-176ef8f3f6d8');
-- (d) 조인 실패로 누락된 source_id — 기대 0행
SELECT v.source_id FROM (VALUES ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc'), ('8d7d0cee-5d21-41b3-92c4-aaf741bb6947'), ('a44e50a7-1b1d-4861-a066-4efda45b1b72'), ('aa66ad93-d1a3-4f4e-996c-3b98d7b77765'), ('cb1d0cee-1203-48a0-96ee-176ef8f3f6d8')) AS v(source_id)
  WHERE NOT EXISTS (SELECT 1 FROM books b
     WHERE b.source_platform='bloom' AND b.source_id=v.source_id);
-- (e) source 라벨 분포 — 기대 manifest_txt_v1 1종 / 55행
SELECT bt.source, count(*) FROM book_text bt JOIN books b ON b.id=bt.book_id
  WHERE b.source_platform='bloom' AND b.source_id IN ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc', '8d7d0cee-5d21-41b3-92c4-aaf741bb6947', 'a44e50a7-1b1d-4861-a066-4efda45b1b72', 'aa66ad93-d1a3-4f4e-996c-3b98d7b77765', 'cb1d0cee-1203-48a0-96ee-176ef8f3f6d8')
  GROUP BY bt.source;
-- (f) page_index 축 검증 — 권마다 0부터 연속이어야 한다. 기대 0행(위반 없음)
SELECT b.source_id, min(bt.page_index) AS mn, max(bt.page_index) AS mx, count(*) AS n
  FROM book_text bt JOIN books b ON b.id=bt.book_id
  WHERE b.source_platform='bloom' AND b.source_id IN ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc', '8d7d0cee-5d21-41b3-92c4-aaf741bb6947', 'a44e50a7-1b1d-4861-a066-4efda45b1b72', 'aa66ad93-d1a3-4f4e-996c-3b98d7b77765', 'cb1d0cee-1203-48a0-96ee-176ef8f3f6d8')
  GROUP BY b.source_id HAVING min(bt.page_index) <> 0 OR max(bt.page_index) <> count(*)-1;
-- (g) 빈 면 행 수 — 기대 14 (D7: 빈 면도 text='' 로 적재)
SELECT count(*) AS empty_rows FROM book_text bt JOIN books b ON b.id=bt.book_id
  WHERE b.source_platform='bloom' AND b.source_id IN ('8cbf55b5-c0de-490c-84c4-d3dc73bf34cc', '8d7d0cee-5d21-41b3-92c4-aaf741bb6947', 'a44e50a7-1b1d-4861-a066-4efda45b1b72', 'aa66ad93-d1a3-4f4e-996c-3b98d7b77765', 'cb1d0cee-1203-48a0-96ee-176ef8f3f6d8') AND bt.text = '';

-- ───────── [종료] ─────────
-- (c)~(g)가 전부 기대값과 일치하면 아래 ROLLBACK; 을 COMMIT; 으로 바꿔 타이핑한다.
ROLLBACK;
