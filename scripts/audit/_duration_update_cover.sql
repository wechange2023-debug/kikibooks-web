-- R-1b 표지 재합성분 duration_ms 정합 갱신 (1행) — 2026-08-21
--
-- 배경
--   `AAAAAHHH!!!! Mmawe!`(book_dash)의 **표지(kind='cover')** 오디오도 내지 4면과
--   동일한 결함이었다 — 발화 617ms, `AAAAAHHH`가 무음(marks·duration_ms·파일 크기가
--   깨진 내지와 완전히 일치했다). 연속 느낌표를 하나로 접어 재합성했다:
--       'AAAAAHHH!!!! Mmawe!'  →  'AAAAAHHH! Mmawe!'
--   Storage 오브젝트는 **동일 키로 덮어썼으므로** audio_path·marks_path는 그대로다.
--   바뀐 것은 파일 길이뿐이다: 1460ms → 1420ms (ffmpeg 실측, 발화 617 → 899ms).
--
-- 왜 UPDATE가 필요한가
--   리더 재생은 duration_ms를 쓰지 않는다(오디오 요소가 파일에서 직접 읽는다).
--   따라서 **기능 영향은 없다.** DB 값이 실제 파일과 40ms 어긋난 채 남지 않도록 맞춘다.
--
-- ★ 실행 전 확인
--   기본은 ROLLBACK이다. 결과를 눈으로 확인한 뒤 마지막 줄을 COMMIT으로 바꿔
--   다시 실행하십시오. (팀장 승인 게이트)
--
-- ※ 내지 4행은 `_duration_update.sql`이 담당한다. 두 파일을 각각 실행하면 된다.

BEGIN;

-- ① 변경 전 상태 (1행, duration_ms = 1460 이어야 한다)
SELECT id, kind, page_index, audio_path, duration_ms
FROM book_audio
WHERE id = '70240ef0-a4bc-4992-88fc-531acea57b01';

-- ② 갱신 — id로 특정해 1행만 건드린다
UPDATE book_audio SET duration_ms = 1420
WHERE id = '70240ef0-a4bc-4992-88fc-531acea57b01';  -- cover.mp3

-- ③ 영향 행수 확인 — **반드시 1이어야 한다**
SELECT count(*) AS updated_rows
FROM book_audio
WHERE id = '70240ef0-a4bc-4992-88fc-531acea57b01'
  AND duration_ms = 1420;

-- ④ 이 책 전체 상태 확인 (내지 4면도 갱신했다면 p1·4·7·10이 1420, 나머지는 원값)
SELECT kind, page_index, duration_ms
FROM book_audio
WHERE book_id = '87069ecb-b546-4cbe-b8b4-bca723b43f12'
  AND voice = 'danielle'
ORDER BY kind, page_index;

-- ⑤ 기본은 되돌린다. ③이 1이고 ④가 정상이면 COMMIT으로 바꿔 재실행하십시오.
ROLLBACK;
-- COMMIT;
