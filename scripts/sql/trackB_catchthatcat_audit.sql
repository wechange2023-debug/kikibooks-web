-- =============================================================================
-- trackB_catchthatcat_audit.sql — catch-that-cat p05 교정·합성 선후 판별
--
-- ★ 읽기 전용 조회. 팀장이 SQL Editor에서 실행한다. ★
--
-- 목적  : 팀장이 지난주 수정한 catch-that-cat 의 텍스트 수정 시각이 TTS 합성(적재)
--         시각보다 나중인지 판별한다. 나중이면 하이라이트 좌표가 밀려 재합성 대상이다
--         (ADR-0058 Amendment #1 G6 — "TTS 완료 도서 텍스트 수정 = 재합성").
-- 성격  : SELECT 1문. INSERT/UPDATE/DELETE 0건. 트랜잭션 미사용(BEGIN·COMMIT 없음).
--         반복 실행해도 DB가 바뀌지 않는다.
-- 실행법: 파일 전체를 SQL Editor에 붙여넣고 한 번에 실행한다.
--
-- 대상
-- -----------------------------------------------------------------------------
--   source_platform = 'book_dash' · source_id = 'catch-that-cat' · page_index = 4
--   page_index 4 = 검수 화면의 "05면"(page_no 5) = 회전 대상 1면
--   (lib/admin/review/rotation-pages.ts 'catch-that-cat': [4])
--
-- 컬럼 실재 확인 (워커 로컬 실측 2026-08-18 — 임의 대체 0건)
-- -----------------------------------------------------------------------------
--   book_text.updated_at    : supabase/migrations/006_review_data_model.sql:21
--   book_review.status      : 006:35  /  book_review.reviewed_at : 006:37
--   book_audio.created_at   : docs/adr/0034-tts-audio-storage-implementation.md:79
--                             (2026-07-04 실행 SQL 원문, `timestamptz not null default now()`)
--                             + docs/recon/state-audit.md:91 "11컬럼 실측"에 created_at 포함
--   book_audio.voice        : ADR-0034:73 / state-audit.md:91
--
-- ★ 해석상 주의 2건 (판정 전 반드시 읽을 것)
-- -----------------------------------------------------------------------------
--   (1) audio_created_at 은 **DB 적재 시각**이지 Polly 합성 시각이 아니다
--       (`default now()`). 로컬 합성 후 적재까지 시차가 있으면 그 구간의 텍스트 수정은
--       이 비교로 잡히지 않는다. 로컬 근거로는 적재 SQL 파일명이 시각을 남긴다 —
--       docs/sql/adr0058/requests/20260814-101906.sql (catch-that-cat 13행, p05 포함).
--   (2) text_updated_at 은 그 행에 UPDATE 가 일어나면 트리거가 갱신한다
--       (touch_updated_at, 006 §2.5). 값이 audio_created_at 보다 **이르면** 텍스트가
--       더 오래됐다는 결론이 확정적이나, **나중이면** 그 UPDATE 가 텍스트 편집이었는지
--       확인이 필요하다(앱에서 book_text 를 쓰는 경로는 saveReviewText 의 text 1컬럼뿐 —
--       lib/admin/review/actions.ts:231-236).
--
-- ★★ 실증 결과 — 이 판정은 **충분조건이 아니다** (2026-08-18 추가) ★★
-- -----------------------------------------------------------------------------
--   본 SQL의 text_newer_than_audio = true 를 근거로 catch-that-cat 을 재합성했다
--   (13행 삭제 → 재합성 run 20260818-152853 → --upload --overwrite 26객체 → 13행 적재).
--
--   그런데 **결과물이 옛 음원과 바이트 단위로 동일**했다:
--     · Storage 객체 크기 26건 전건 무변동 (p03.mp3 59,900B · p05.mp3 54,020B 그대로)
--     · 옛 적재 SQL(20260814-101906.sql)의 duration_ms ↔ 새 manifest out_ms **13/13 일치**
--     · marks JSON 크기 13건 무변동
--
--   원인: `sanitize` 가 연속 공백·개행을 접으므로, 원문의 **공백만 수정하면 Polly 입력은
--   변하지 않는다**. book_text.updated_at 은 그 행에 UPDATE 가 있었다는 사실만 말할 뿐
--   정제 후 텍스트가 달라졌다는 뜻이 아니다.
--
--   → **updated_at > created_at 은 재합성 필요의 '필요조건'일 뿐 '충분조건'이 아니다.**
--   비용: $0.1542 (학습 비용으로 종결, 2026-08-18 팀장 판단).
--
-- ★ 개정된 판정 절차 (2단 판별)
-- -----------------------------------------------------------------------------
--   1단계 — 본 SQL의 text_newer_than_audio 로 **후보를 좁힌다**. (여기서 false면 종료)
--   2단계 — 처리기 드라이런을 돌려 **[좌표] 정합 판정으로 확정한다**:
--             PYTHONUTF8=1 python scripts/tts_pilot/process_tts_requests.py
--           · `[⚠ 좌표 경고]` 가 뜬 면이 있으면 → 재합성 대상이다.
--           · `[좌표] 전 유닛 정합 ✅` 이면 → **재합성 불요**. 여기서 멈춘다.
--   1단계만으로 재합성을 착수하지 말 것. 2단계가 실제 필요 여부의 유일한 실측 근거다.
--
-- 읽는 법
-- -----------------------------------------------------------------------------
--   verdict 열이 결론이다.
--   audio_created_at 이 NULL  → 그 면에 오디오 행이 없다(=이 면은 재합성 쟁점 아님).
--   행이 2개 이상 나오면 voice 별로 오디오가 여러 벌 있다는 뜻이다(voice 열로 구분).
-- =============================================================================

WITH b AS (
  SELECT bk.id, bk.source_id, bk.source_platform, bk.title, bk.is_active
    FROM public.books bk
   WHERE bk.source_platform = 'book_dash'
     AND bk.source_id       = 'catch-that-cat'
),
t AS (
  SELECT bt.book_id, bt.page_index, bt.text, bt.updated_at
    FROM public.book_text bt
    JOIN b ON b.id = bt.book_id
   WHERE bt.page_index = 4
),
a AS (
  SELECT ba.book_id, ba.page_index, ba.kind, ba.voice,
         ba.audio_path, ba.created_at
    FROM public.book_audio ba
    JOIN b ON b.id = ba.book_id
   WHERE ba.page_index = 4
)
SELECT
  b.id                                        AS book_id,
  b.source_id                                 AS source_id,
  b.title                                     AS title,
  4                                           AS page_index,
  5                                           AS page_no,

  t.updated_at                                AS text_updated_at,
  a.created_at                                AS audio_created_at,
  a.voice                                     AS audio_voice,
  a.kind                                      AS audio_kind,
  a.audio_path                                AS audio_path,

  r.status                                    AS review_status,
  r.reviewed_at                               AS review_reviewed_at,

  -- 핵심 판정 열 — 텍스트 수정이 오디오 적재보다 나중인가
  (t.updated_at > a.created_at)               AS text_newer_than_audio,
  (t.updated_at - a.created_at)               AS text_minus_audio,

  char_length(t.text)                         AS text_chars,
  char_length(replace(replace(t.text, chr(13), ''), chr(10), ''))
                                              AS text_chars_no_newline,

  CASE
    WHEN t.updated_at IS NULL THEN
      'STOP — book_text 행 없음(교정 대상 면이 DB에 없다)'
    WHEN a.created_at IS NULL THEN
      '재합성 무관 — 이 면에 book_audio 행이 없다'
    WHEN t.updated_at > a.created_at THEN
      '재합성 대상 — 텍스트가 오디오보다 나중 (ADR-0058 Amd#1 G6 발동)'
    ELSE
      '재합성 불요 — 오디오가 텍스트보다 나중(좌표 정합)'
  END                                         AS verdict,

  -- 참고: 이 책 전체의 오디오 적재 시각 범위·행수
  (SELECT count(*)          FROM public.book_audio x WHERE x.book_id = b.id) AS audio_rows_book,
  (SELECT min(x.created_at) FROM public.book_audio x WHERE x.book_id = b.id) AS audio_first_book,
  (SELECT max(x.created_at) FROM public.book_audio x WHERE x.book_id = b.id) AS audio_last_book,
  (SELECT max(x.updated_at) FROM public.book_text  x WHERE x.book_id = b.id) AS text_last_book,
  b.is_active                                 AS is_active

  FROM b
  LEFT JOIN t ON t.book_id = b.id
  LEFT JOIN a ON a.book_id = b.id
  LEFT JOIN public.book_review r ON r.book_id = b.id
 ORDER BY a.voice NULLS FIRST, a.kind;

-- =============================================================================
-- 끝. 쓰기문 0건. 이 파일은 DB 상태를 바꾸지 않는다.
-- =============================================================================
