-- R-1 재합성분 duration_ms 정합 갱신 (4행) — 2026-08-21
--
-- 배경
--   `AAAAAHHH!!!! Mmawe!`(book_dash) p1·p4·p7·p10의 mp3에 `AAAAAHHH` 발화가 없어
--   재합성했다(연속 느낌표 축소 `AAAAAHHH!!!! Mmawe!` → `Aaaaahhh! Mmawe!`).
--   Storage 오브젝트는 **동일 키로 덮어썼으므로** audio_path·marks_path는 그대로다.
--   바뀐 것은 파일 길이뿐이다: 1460ms → 1420ms (ffmpeg 실측).
--     · 실제 발화량은 617ms → 899ms로 늘었다(무음이 줄어 총 길이는 오히려 짧아졌다).
--
-- 왜 UPDATE가 필요한가
--   리더 재생은 duration_ms를 쓰지 않는다(오디오 요소가 파일에서 직접 읽는다).
--   따라서 **기능 영향은 없다.** 다만 DB 값이 실제 파일과 40ms 어긋난 채 남으면
--   이후 감사·통계가 잘못된 값을 근거로 삼는다. 정합을 위해 갱신한다.
--
-- ★ 실행 전 확인
--   기본은 ROLLBACK이다. 결과를 눈으로 확인한 뒤, 마지막 줄을 COMMIT으로 바꿔
--   다시 실행하십시오. (팀장 승인 게이트 — Hard Rule 8 정합)

BEGIN;

-- ① 변경 전 상태 확인 (4행, 전부 duration_ms = 1460 이어야 한다)
SELECT id, page_index, audio_path, duration_ms
FROM book_audio
WHERE book_id = '87069ecb-b546-4cbe-b8b4-bca723b43f12'
  AND voice = 'danielle'
  AND kind  = 'page'
  AND page_index IN (1, 4, 7, 10)
ORDER BY page_index;

-- ② 갱신 — id로 특정해 4행만 건드린다(범위 사고 방지)
UPDATE book_audio SET duration_ms = 1420
WHERE id IN (
  '9d80cd5c-e8d3-4679-80d6-beb75801ac9c',  -- page_index 1  → p02.mp3
  '6257eab2-7f29-4929-91e8-b7125992330b',  -- page_index 4  → p05.mp3
  '75279f91-f0e0-41d6-90ad-988f2fe991af',  -- page_index 7  → p08.mp3
  'e23a1f4e-3b96-49db-b3be-ba9b67104e2b'   -- page_index 10 → p11.mp3
);

-- ③ 영향 행수 확인 — **반드시 4여야 한다**
SELECT count(*) AS updated_rows
FROM book_audio
WHERE id IN (
  '9d80cd5c-e8d3-4679-80d6-beb75801ac9c',
  '6257eab2-7f29-4929-91e8-b7125992330b',
  '75279f91-f0e0-41d6-90ad-988f2fe991af',
  'e23a1f4e-3b96-49db-b3be-ba9b67104e2b'
) AND duration_ms = 1420;

-- ④ 이 책의 다른 면이 영향받지 않았는지 확인 (나머지는 값이 그대로여야 한다)
SELECT page_index, duration_ms
FROM book_audio
WHERE book_id = '87069ecb-b546-4cbe-b8b4-bca723b43f12'
  AND voice = 'danielle' AND kind = 'page'
ORDER BY page_index;

-- ⑤ 기본은 되돌린다. 위 ③이 4이고 ④가 정상이면 COMMIT으로 바꿔 재실행하십시오.
ROLLBACK;
-- COMMIT;
