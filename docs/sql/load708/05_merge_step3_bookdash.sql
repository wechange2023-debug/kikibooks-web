-- 05_merge_step3_bookdash.sql — step3 (book_dash) 본 테이블 머지
-- 생성: scripts/tts_pilot/gen_book_audio_sql_708.py (워커, DB 접속 0건)
-- 근거: ADR-0053 D4(전량 확장) / ADR-0034(결정 ①②③ + Amd#1 kind · Amd#2 성우 층위)
--       / ADR-0052 D5(page_index 축) · Amd#2(rate 의미) · D8(워커 DB 직접 쓰기 금지)
--
-- ★★ 이 파일은 끝이 ROLLBACK; 이다. 그대로 실행하면 **아무것도 남지 않는다**. ★★
--    검증 SELECT 결과가 전부 기대값과 같으면, 맨 끝 ROLLBACK; 을 COMMIT; 으로
--    직접 고쳐 타이핑한 뒤 다시 실행할 것. (자동 COMMIT 금지 — 팀장 확인 영역)
--
-- ★ 선행 조건: 02_staging_verify 의 verdict 가 PASS.
-- ★ 이 파일은 VALUES를 담지 않는다(staging에서 SELECT). 그래서 짧고 Editor 제한에 안 걸린다.
--
-- ※ Supabase SQL Editor는 스크립트를 자체 트랜잭션으로 감싸는 경우가 있어 BEGIN에서
--   'there is already a transaction in progress' WARNING이 뜰 수 있다. 경고이지 에러가
--   아니며 ROLLBACK/COMMIT은 정상 동작한다. ERROR 로 시작하는 줄만 실패로 취급할 것.
-- ※ [2]·[3]의 DO 블록은 fail-closed 가드다. 여기서 STOP이 뜨면 트랜잭션이 죽고 이후
--   문장이 'current transaction is aborted'로 줄줄이 실패한다 — 정상 동작이다.
--   맨 처음 뜬 STOP 메시지만 워커에게 전달하면 된다.
--
-- 규모: 39권 / 507행 (page 468 + cover 39)
-- 값  : voice='danielle' · engine='long-form' · rate=85 (atempo 0.85의 실효 속도, SSML prosody 아님)
--        duration_ms = 감속 후 mp3 실측(ffmpeg). audio_path = 버킷명 미포함 오브젝트 키.
--
-- 기존 행 보호:
--   · INSERT 에 ON CONFLICT 절이 **없다**. 충돌이 있으면 에러로 죽는다(=덮어쓰기 불가).
--   · 구 44권(voice='Ruth')은 UNIQUE에서 자연 분리 — 무접촉.
--   · 모든 검사·삽입은 source_platform = 'book_dash' 로 한정된다.
--     (앞 step을 COMMIT 한 뒤 실행해도 앞 step 행이 충돌로 잡히지 않는다)

BEGIN;

-- ============================================================
-- [0] 사전 상태 스냅샷
-- ============================================================
-- 기대: danielle_books 797 / danielle_rows 9085 / page 8288 / cover 797
--   이 수치가 다르면 즉시 중단(앞 step 미실행? 중복 실행?).
SELECT count(DISTINCT book_id) AS danielle_books,
       count(*)                               AS danielle_rows,
       count(*) FILTER (WHERE kind = 'page')  AS page_rows,
       count(*) FILTER (WHERE kind = 'cover') AS cover_rows
  FROM public.book_audio WHERE voice = 'danielle';

-- 기대: ruth_books 44 / ruth_rows 574
SELECT count(DISTINCT book_id) AS ruth_books, count(*) AS ruth_rows
  FROM public.book_audio WHERE voice = 'Ruth';

-- ============================================================
-- [1] staging 해당 플랫폼분 확인
-- ============================================================
-- 기대: staged_rows 507 / staged_books 39 / page 468 / cover 39
SELECT count(*)                                 AS staged_rows,
       count(DISTINCT source_id)                AS staged_books,
       count(*) FILTER (WHERE kind = 'page')    AS page_rows,
       count(*) FILTER (WHERE kind = 'cover')   AS cover_rows
  FROM public.book_audio_staging_708 WHERE source_platform = 'book_dash';

-- ============================================================
-- [2] 매핑 게이트 (fail-closed)
-- ============================================================
-- 기대: mapped_books 39 / unmapped_rows 0 / mismatched_rows 0
SELECT
  (SELECT count(DISTINCT b.id)
     FROM public.book_audio_staging_708 s JOIN public.books b
       ON b.source_platform = s.source_platform AND b.source_id = s.source_id
    WHERE s.source_platform = 'book_dash')          AS mapped_books,
  (SELECT count(*) FROM public.book_audio_staging_708 s
    WHERE s.source_platform = 'book_dash' AND NOT EXISTS (
      SELECT 1 FROM public.books b
       WHERE b.source_platform = s.source_platform AND b.source_id = s.source_id))
                                                     AS unmapped_rows,
  (SELECT count(*) FROM public.book_audio_staging_708 s JOIN public.books b
       ON b.source_platform = s.source_platform AND b.source_id = s.source_id
    WHERE s.source_platform = 'book_dash' AND b.id <> s.manifest_book_id)
                                                     AS mismatched_rows;

DO $$
DECLARE v_rows int; v_books int; v_unmapped int; v_mismatch int;
BEGIN
  SELECT count(*), count(DISTINCT source_id) INTO v_rows, v_books
    FROM public.book_audio_staging_708 WHERE source_platform = 'book_dash';
  IF v_rows <> 507 THEN
    RAISE EXCEPTION 'STOP: staging book_dash 행 수 % ≠ 기대 507 — 청크 적재 미완. 머지 중단', v_rows;
  END IF;
  IF v_books <> 39 THEN
    RAISE EXCEPTION 'STOP: staging book_dash 권 수 % ≠ 기대 39 — 머지 중단', v_books;
  END IF;
  SELECT count(*) INTO v_unmapped FROM public.book_audio_staging_708 s
   WHERE s.source_platform = 'book_dash' AND NOT EXISTS (
    SELECT 1 FROM public.books b
     WHERE b.source_platform = s.source_platform AND b.source_id = s.source_id);
  IF v_unmapped <> 0 THEN
    RAISE EXCEPTION 'STOP: books 매핑 실패 % 행 — 머지 중단', v_unmapped;
  END IF;
  SELECT count(*) INTO v_mismatch FROM public.book_audio_staging_708 s JOIN public.books b
     ON b.source_platform = s.source_platform AND b.source_id = s.source_id
   WHERE s.source_platform = 'book_dash' AND b.id <> s.manifest_book_id;
  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION 'STOP: 매니페스트 book_id 불일치 % 행 — 머지 중단', v_mismatch;
  END IF;
END $$;

-- ============================================================
-- [3] 충돌 게이트 (fail-closed)
-- ============================================================
-- 기대: conflict_unique 0 / conflict_audio_path 0
SELECT
  (SELECT count(*) FROM public.book_audio_staging_708 s
     JOIN public.books b
       ON b.source_platform = s.source_platform AND b.source_id = s.source_id
     JOIN public.book_audio a
       ON a.book_id = b.id AND a.kind = s.kind
      AND a.page_index = s.page_index AND a.voice = 'danielle'
    WHERE s.source_platform = 'book_dash')          AS conflict_unique,
  (SELECT count(*) FROM public.book_audio_staging_708 s
     JOIN public.book_audio a ON a.audio_path = s.audio_path
    WHERE s.source_platform = 'book_dash')          AS conflict_audio_path;

DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.book_audio_staging_708 s
    JOIN public.books b
      ON b.source_platform = s.source_platform AND b.source_id = s.source_id
    JOIN public.book_audio a
      ON a.book_id = b.id AND a.kind = s.kind
     AND a.page_index = s.page_index AND a.voice = 'danielle'
   WHERE s.source_platform = 'book_dash';
  IF v <> 0 THEN
    RAISE EXCEPTION 'STOP: 기존 행과 충돌 % 건 — 머지 중단', v;
  END IF;
  SELECT count(*) INTO v FROM public.book_audio_staging_708 s
    JOIN public.book_audio a ON a.audio_path = s.audio_path
   WHERE s.source_platform = 'book_dash';
  IF v <> 0 THEN
    RAISE EXCEPTION 'STOP: audio_path 중복 % 건 — 머지 중단', v;
  END IF;
END $$;

-- ============================================================
-- [4] book_audio INSERT — 39권 / 507행
-- ============================================================
INSERT INTO public.book_audio
  (book_id, kind, page_index, audio_path, marks_path, voice, engine, rate, duration_ms)
SELECT b.id, s.kind, s.page_index, s.audio_path, s.marks_path,
       'danielle', 'long-form', 85, s.duration_ms
  FROM public.book_audio_staging_708 s
  JOIN public.books b
    ON b.source_platform = s.source_platform AND b.source_id = s.source_id
 WHERE s.source_platform = 'book_dash';

-- ============================================================
-- [5] 사후 검증
-- ============================================================
-- 기대: danielle_books 836 / danielle_rows 9592 / page 8756 / cover 836
--   (= 적재 전 797권 9085행 + 본 step 39권 507행)
SELECT count(DISTINCT book_id) AS danielle_books,
       count(*)                               AS danielle_rows,
       count(*) FILTER (WHERE kind = 'page')  AS page_rows,
       count(*) FILTER (WHERE kind = 'cover') AS cover_rows
  FROM public.book_audio WHERE voice = 'danielle';

-- 본 step 적재분만 재확인 (기대: step_books 39 / step_rows 507 / page 468 / cover 39)
SELECT count(DISTINCT a.book_id)                 AS step_books,
       count(*)                                  AS step_rows,
       count(*) FILTER (WHERE a.kind = 'page')   AS page_rows,
       count(*) FILTER (WHERE a.kind = 'cover')  AS cover_rows
  FROM public.book_audio a
  JOIN public.book_audio_staging_708 s ON s.audio_path = a.audio_path
 WHERE s.source_platform = 'book_dash';

-- 표지 누락 권 (기대: 0) — 본 step 39권 중 cover 행이 없는 책
SELECT count(*) AS books_missing_cover FROM (
  SELECT b.id FROM public.books b
   WHERE b.source_platform = 'book_dash'
     AND b.source_id IN (SELECT DISTINCT source_id FROM public.book_audio_staging_708
                          WHERE source_platform = 'book_dash')
     AND NOT EXISTS (SELECT 1 FROM public.book_audio a
                      WHERE a.book_id = b.id AND a.voice = 'danielle' AND a.kind = 'cover')
) t;

-- 경로 규약 위반 (기대: 0) · duration NULL (기대: 0)
SELECT
  (SELECT count(*) FROM public.book_audio
    WHERE voice = 'danielle'
      AND (audio_path LIKE 'book-audio/%' OR audio_path NOT LIKE '%/danielle/%'))
                                                     AS bad_path,
  (SELECT count(*) FROM public.book_audio WHERE voice = 'danielle' AND duration_ms IS NULL)
                                                     AS null_duration;

-- 구 44권 무간섭 확인 (기대: 44 / 574)
SELECT count(DISTINCT book_id) AS ruth_books, count(*) AS ruth_rows
  FROM public.book_audio WHERE voice = 'Ruth';

-- ============================================================
ROLLBACK;
-- ============================================================

-- ┌──────────────────────────────────────────────────────────┐
-- │ step3 (book_dash) 기대값 대조표 — 팀장 확인용
-- ├──────────────────────────────────────────────────────────┤
-- │ [0] 적재 전  danielle books  797 rows  9085 page  8288 cover  797
-- │            Ruth     books   44 rows   574
-- │ [1] staging rows   507 books   39 page   468 cover   39
-- │ [2] 매핑     mapped_books   39 · unmapped 0 · mismatched 0
-- │ [3] 충돌     conflict_unique 0 · conflict_audio_path 0
-- │ [4] INSERT  507행
-- │ [5] 적재 후  danielle books  836 rows  9592 page  8756 cover  836
-- │            step 적재분 books   39 rows   507
-- │            books_missing_cover 0 · bad_path 0 · null_duration 0
-- │            Ruth     books   44 rows   574 (불변)
-- ├──────────────────────────────────────────────────────────┤
-- │ 전부 일치하면 위 ROLLBACK; 을 COMMIT; 으로 바꿔 재실행.
-- │ 하나라도 다르면 COMMIT 하지 말고 워커에게 수치를 그대로 전달할 것.
-- │ 다음: 06_final_verify.sql
-- └──────────────────────────────────────────────────────────┘
