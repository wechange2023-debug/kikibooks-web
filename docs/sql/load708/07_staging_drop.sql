-- 07_staging_drop.sql — staging 정리 (마지막)
-- 생성: scripts/tts_pilot/gen_book_audio_sql_708.py (워커, DB 접속 0건)
-- 근거: ADR-0053 D4(전량 확장) / ADR-0034(결정 ①②③ + Amd#1 kind · Amd#2 성우 층위)
--       / ADR-0052 D5(page_index 축) · Amd#2(rate 의미) · D8(워커 DB 직접 쓰기 금지)
--
-- ★ 실행 조건: 03/04/05 머지를 모두 COMMIT 하고 06_final_verify 가 PASS 한 뒤.
--   그 전에 지우면 청크 1.6MB를 처음부터 다시 올려야 한다.
-- ★ 이 파일은 book_audio 를 건드리지 않는다. staging 테이블만 지운다.

-- 지우기 전 확인 (기대: staging_rows 7978)
SELECT count(*) AS staging_rows FROM public.book_audio_staging_708;

DROP TABLE IF EXISTS public.book_audio_staging_708;

-- 확인 (기대: should_be_null = NULL)
SELECT to_regclass('public.book_audio_staging_708') AS should_be_null;

-- ┌──────────────────────────────────────────────────────────┐
-- │ 07 기대값 — staging_rows 7978 → DROP → should_be_null NULL
-- │ 전체 적재 절차 종료.
-- └──────────────────────────────────────────────────────────┘
