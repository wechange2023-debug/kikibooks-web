-- 목적: book_text 페이지 단위 본문 적재 (bloom · 이 파일: 1of2)
-- 실행자: 팀장(Supabase SQL Editor). 워커 초안. 워커 DB 직접 쓰기 금지.
-- 근거 ADR: ADR-0056 (ADR-0056 D1·D2·D4·D5) · Accepted 2026-08-10
-- source 라벨: manifest_txt_v1
-- 이 파일 담당: 5권 / 80행 (정제 후 빈 면 5행 포함 — D7)
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
  WHERE b.source_platform='bloom' AND b.source_id IN ('01bb98de-b779-48c8-8f0f-d910a49ab07f', '05bdb04b-3f95-4e7f-9332-f5444a7fca1a', '24cf0eb3-8688-483e-a279-8c2a53f0e884', '33c35227-7327-4f01-ae44-4167269d1472', '8b280edc-ab53-4598-9129-085bb2e04455');
-- (b) 대상 source_id 중 books에 존재하는 권 수 — 기대 5
SELECT count(*) AS books_found FROM books
  WHERE source_platform='bloom' AND source_id IN ('01bb98de-b779-48c8-8f0f-d910a49ab07f', '05bdb04b-3f95-4e7f-9332-f5444a7fca1a', '24cf0eb3-8688-483e-a279-8c2a53f0e884', '33c35227-7327-4f01-ae44-4167269d1472', '8b280edc-ab53-4598-9129-085bb2e04455');

-- ───────── [적재] ─────────
BEGIN;
INSERT INTO book_text (book_id, page_index, text, blocks, source)
SELECT b.id, v.page_index, v.text, NULL::jsonb, $$manifest_txt_v1$$
  FROM (VALUES
    ('01bb98de-b779-48c8-8f0f-d910a49ab07f', 0, $$Big hat. Little hat.$$),
    ('01bb98de-b779-48c8-8f0f-d910a49ab07f', 1, $$$$),
    ('01bb98de-b779-48c8-8f0f-d910a49ab07f', 2, $$Big hands. Little hands.$$),
    ('01bb98de-b779-48c8-8f0f-d910a49ab07f', 3, $$$$),
    ('01bb98de-b779-48c8-8f0f-d910a49ab07f', 4, $$Big goat. Little goat.$$),
    ('01bb98de-b779-48c8-8f0f-d910a49ab07f', 5, $$$$),
    ('01bb98de-b779-48c8-8f0f-d910a49ab07f', 6, $$Big book. Little book.$$),
    ('01bb98de-b779-48c8-8f0f-d910a49ab07f', 7, $$$$),
    ('01bb98de-b779-48c8-8f0f-d910a49ab07f', 8, $$Big smile. Little smile.$$),
    ('01bb98de-b779-48c8-8f0f-d910a49ab07f', 9, $$$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 0, $$One day, Noakawir and his wife went to visit Nakau and his wife.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 1, $$When they arrived, Nakau and his wife welcomed them.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 2, $$They killed a chicken and cooked it for them.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 3, $$And they all ate together.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 4, $$Later, Nakau and his wife went to visit Noakawir and his wife.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 5, $$When they arrived, Noakawir was not at home.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 6, $$He had gone out to set a trap to catch a wild bird.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 7, $$When Noakawir came back to the village, he saw his two friends and he was happy.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 8, $$He went to see what his wife was cooking.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 9, $$She was cooking beans.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 10, $$He was angry because he did not think that beans were a good meal. He kicked over the saucepan, and some beans spilled out.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 11, $$He told his friends about the trap he had set near where a bird was nesting.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 12, $$As they were talking, Noakawir heard the sound of the bird calling.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 13, $$Then he knew that his trap had caught the bird!$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 14, $$Noakawir jumped up, stuck his knife in his belt, and ran off to catch the bird.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 15, $$Trembling with excitement, he grabbed the bird in one hand.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 16, $$With his other hand he gathered up the eggs.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 17, $$He went back to the village, and he was very happy.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 18, $$But as he was walking, his knife was cutting away at his belt.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 19, $$Proudly Noakawir walked into the village.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 20, $$At that moment his belt snapped and his lava-lava fell off!$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 21, $$He tried to grab the cloth and let go of the bird.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 22, $$It flew away. The eggs lay broken on the ground.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 23, $$Nakau and his wife laughed and laughed.$$),
    ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a', 24, $$Then they all ate what was left of the beans in the pan.$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 0, $$Look at me, animals! I am a human being! I know everything!$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 1, $$Look, these are my eyes. I can see everything with them.$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 2, $$So what? We have eyes too. And we can see in the dark!$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 3, $$Fine, but look at my nose. I breathe through my nose.$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 4, $$So what? We also have noses and ours are prettier than yours!$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 5, $$And yes, my teeth. I use my teeth to chew and bite.$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 6, $$Teeth? Ha! Ha! Have you seen our teeth? You can chew. But WE CAN BITE! Hiee.. Hiee…Hiee…$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 7, $$Yes, but listen! I can hear a lot with my ears!$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 8, $$Little one! We can hear sounds which you cannot imagine at all!$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 9, $$And I can walk, run and even dance with my feet.$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 10, $$Oh! We have four feet! We can jump, we can dance and we can parade too!$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 11, $$I can plait my hair.$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 12, $$Uh! Our hair is pretty too. We could plait it if we wanted to. Maybe!$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 13, $$Look! I can work with my hands!$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 14, $$Hands! Keep your hands to yourself!$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 15, $$Aha! I told you! I am the best! I know it all!$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 16, $$Really? Have you seen our sharp claws?$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 17, $$Yes! But your nails will pick up dirt!$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 18, $$Now see, these are our lovely tails.$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 19, $$Tails! We gave them up long ago! How else could we wear our shorts?$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 20, $$And we can roar!$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 21, $$Roar? Have you heard my mother?$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 22, $$So then! You are only animals - I know that!$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 23, $$So then! You are only animals - I know that!$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 24, $$Humans are animals too. We know that!$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 25, $$You may be right. Look at my brother! Mother says he is wild. He is definitely an animal.$$),
    ('24cf0eb3-8688-483e-a279-8c2a53f0e884', 26, $$Humans are animals too. We know that!$$),
    ('33c35227-7327-4f01-ae44-4167269d1472', 0, $$I can’t knit, cats can’t write, fish can’t blink...$$),
    ('33c35227-7327-4f01-ae44-4167269d1472', 1, $$... pigs can't fly!$$),
    ('33c35227-7327-4f01-ae44-4167269d1472', 2, $$Dogs can’t dance, ants can’t read, crows can’t sing...$$),
    ('33c35227-7327-4f01-ae44-4167269d1472', 3, $$... monkeys can't cook!$$),
    ('33c35227-7327-4f01-ae44-4167269d1472', 4, $$But, monkeys can swing!$$),
    ('33c35227-7327-4f01-ae44-4167269d1472', 5, $$Crows can caw... ants can bite... dogs can bark!$$),
    ('33c35227-7327-4f01-ae44-4167269d1472', 6, $$Pigs can eat, fish can swim, cats can jump... and I can read!$$),
    ('8b280edc-ab53-4598-9129-085bb2e04455', 0, $$Once there was a very tall man.$$),
    ('8b280edc-ab53-4598-9129-085bb2e04455', 1, $$His hoe was too short.$$),
    ('8b280edc-ab53-4598-9129-085bb2e04455', 2, $$His doorway was too low.$$),
    ('8b280edc-ab53-4598-9129-085bb2e04455', 3, $$His bed was too short.$$),
    ('8b280edc-ab53-4598-9129-085bb2e04455', 4, $$His bicycle was too short.$$),
    ('8b280edc-ab53-4598-9129-085bb2e04455', 5, $$He made a very long hoe handle.$$),
    ('8b280edc-ab53-4598-9129-085bb2e04455', 6, $$He made very high doors.$$),
    ('8b280edc-ab53-4598-9129-085bb2e04455', 7, $$He made a very long bed.$$),
    ('8b280edc-ab53-4598-9129-085bb2e04455', 8, $$He bought a very tall bicycle.$$),
    ('8b280edc-ab53-4598-9129-085bb2e04455', 9, $$He sat on a very high chair. He ate with a very long fork.$$),
    ('8b280edc-ab53-4598-9129-085bb2e04455', 10, $$And he built himself a very tall house, where he lived quite happily.$$)
  ) AS v(source_id, page_index, text)
  JOIN books b
    ON b.source_platform = 'bloom' AND b.source_id = v.source_id
ON CONFLICT (book_id, page_index) DO NOTHING;

-- ───────── [적재검증] 트랜잭션 안 ─────────
-- (c) 적재 후 행 수 — 기대 80
SELECT count(*) AS rows_after FROM book_text bt
  JOIN books b ON b.id = bt.book_id
  WHERE b.source_platform='bloom' AND b.source_id IN ('01bb98de-b779-48c8-8f0f-d910a49ab07f', '05bdb04b-3f95-4e7f-9332-f5444a7fca1a', '24cf0eb3-8688-483e-a279-8c2a53f0e884', '33c35227-7327-4f01-ae44-4167269d1472', '8b280edc-ab53-4598-9129-085bb2e04455');
-- (d) 조인 실패로 누락된 source_id — 기대 0행
SELECT v.source_id FROM (VALUES ('01bb98de-b779-48c8-8f0f-d910a49ab07f'), ('05bdb04b-3f95-4e7f-9332-f5444a7fca1a'), ('24cf0eb3-8688-483e-a279-8c2a53f0e884'), ('33c35227-7327-4f01-ae44-4167269d1472'), ('8b280edc-ab53-4598-9129-085bb2e04455')) AS v(source_id)
  WHERE NOT EXISTS (SELECT 1 FROM books b
     WHERE b.source_platform='bloom' AND b.source_id=v.source_id);
-- (e) source 라벨 분포 — 기대 manifest_txt_v1 1종 / 80행
SELECT bt.source, count(*) FROM book_text bt JOIN books b ON b.id=bt.book_id
  WHERE b.source_platform='bloom' AND b.source_id IN ('01bb98de-b779-48c8-8f0f-d910a49ab07f', '05bdb04b-3f95-4e7f-9332-f5444a7fca1a', '24cf0eb3-8688-483e-a279-8c2a53f0e884', '33c35227-7327-4f01-ae44-4167269d1472', '8b280edc-ab53-4598-9129-085bb2e04455')
  GROUP BY bt.source;
-- (f) page_index 축 검증 — 권마다 0부터 연속이어야 한다. 기대 0행(위반 없음)
SELECT b.source_id, min(bt.page_index) AS mn, max(bt.page_index) AS mx, count(*) AS n
  FROM book_text bt JOIN books b ON b.id=bt.book_id
  WHERE b.source_platform='bloom' AND b.source_id IN ('01bb98de-b779-48c8-8f0f-d910a49ab07f', '05bdb04b-3f95-4e7f-9332-f5444a7fca1a', '24cf0eb3-8688-483e-a279-8c2a53f0e884', '33c35227-7327-4f01-ae44-4167269d1472', '8b280edc-ab53-4598-9129-085bb2e04455')
  GROUP BY b.source_id HAVING min(bt.page_index) <> 0 OR max(bt.page_index) <> count(*)-1;
-- (g) 빈 면 행 수 — 기대 5 (D7: 빈 면도 text='' 로 적재)
SELECT count(*) AS empty_rows FROM book_text bt JOIN books b ON b.id=bt.book_id
  WHERE b.source_platform='bloom' AND b.source_id IN ('01bb98de-b779-48c8-8f0f-d910a49ab07f', '05bdb04b-3f95-4e7f-9332-f5444a7fca1a', '24cf0eb3-8688-483e-a279-8c2a53f0e884', '33c35227-7327-4f01-ae44-4167269d1472', '8b280edc-ab53-4598-9129-085bb2e04455') AND bt.text = '';

-- ───────── [종료] ─────────
-- (c)~(g)가 전부 기대값과 일치하면 아래 ROLLBACK; 을 COMMIT; 으로 바꿔 타이핑한다.
ROLLBACK;
