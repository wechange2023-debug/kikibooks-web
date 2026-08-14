-- =============================================================================
-- 03_clean_polluted6_prefix.sql — 오염 6권 제작 메타데이터 접두 제거 (트랙 A)
--
-- 근거   : ADR-0053 D3(입구 정제 게이트) · Consequences("오염 6권은 검수 화면에서
--          텍스트 수정 후 별도 배치로 처리") · 2026-08-14 팀장 승인 2(스크립트 전처리 채택)
-- 실행자 : 팀장 (Supabase SQL Editor). 워커 DB 직접 쓰기 금지(ADR-0058 D7-①).
-- 대상   : Book Dash 152/154 코호트 6권 × 각 1면 = **6행**
--
-- 무엇을 지우는가
-- -----------------------------------------------------------------------------
--   원본 PDF의 편집용 주석 "Story spread N"이 본문 맨 앞에 섞여 들어갔다. 그대로
--   낭독하면 "스토리 스프레드 텐" 같은 소리가 본문 앞에 붙는다.
--
--   워커 로컬 실측(2026-08-14, scripts/pdf_harvest/out_154/{slug}.pages.json):
--     · 6권 전부 **접두(prefix)** 형태로만 오염됐다 — `^Story spread \d+` 앵커 100% 일치
--     · 권당 정확히 **1면**, N은 1-based page_no와 일치
--     · 접두 제거 후 나머지는 정상 본문
--     · 알려진 오탐 you-yes-you p12("Almost at the back cover!")는 이 앵커에 매칭 불가
--
--   | slug              | page_index | 제거 대상        |
--   |-------------------|-----------:|------------------|
--   | and-also          |          9 | 'Story spread 10'|
--   | little-goat       |          3 | 'Story spread 4' |
--   | look-up           |          1 | 'Story spread 2' |
--   | the-rainbow-cloud |          7 | 'Story spread 8' |
--   | where-is-lulu     |          8 | 'Story spread 9' |
--   | yes-you-can       |          1 | 'Story spread 2' |
--
-- ★ 정규식: 지시서의 `^Story spread \d+\s+`와 동치인 POSIX 표기
--   `^Story spread [0-9]+[[:space:]]+` 를 쓴다. 이스케이프 해석 여지를 없애기 위함이다.
--   WHERE와 replace가 **같은 패턴**이라 "조건은 맞는데 치환이 안 되는" 틈이 없다.
--
-- ★ 이중 안전장치: slug 6개 화이트리스트 **AND** 접두 정규식. 둘 다 만족해야 갱신된다.
--
-- ★ 실행 방법: 전체를 한 번에 실행한다(블록 분할 금지). 결과는 표 1개다 —
--   상세 6행(사전/사후 대조) + 합계 1행. 기대값이 맞으면 맨 끝 ROLLBACK을
--   COMMIT으로 직접 고쳐 타이핑한 뒤 재실행할 것(ADR-0053 E9 규약).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 사전 상태 확보 + 접두 제거 + 사후 대조 — 전부 단일 SELECT 문장
--
--   before : UPDATE 이전 본문. 같은 문장 안의 WITH 하위 구문은 동일 스냅샷을 보므로
--            UPDATE 효과가 섞이지 않는다(ADR-0058 §실행 완결 4 — CTE 단일 문장 표준).
--   upd    : 조건부 UPDATE. RETURNING은 **변경 후** 값이므로 사후 상태 그 자체다.
--
-- 기대: 상세 6행 전원 row_check='OK' / 합계행 updated_rows=6 · books=6 · verdict='PASS …'
-- -----------------------------------------------------------------------------
WITH before AS (
  SELECT t.id,
         b.source_id,
         t.page_index,
         t.text AS text_before
    FROM public.book_text t
    JOIN public.books b ON b.id = t.book_id
   WHERE b.source_platform = 'book_dash'
     AND b.source_id IN ('and-also', 'little-goat', 'look-up',
                         'the-rainbow-cloud', 'where-is-lulu', 'yes-you-can')
     AND t.text ~ '^Story spread [0-9]+[[:space:]]+'
),
upd AS (
  UPDATE public.book_text t
     SET text = regexp_replace(t.text, '^Story spread [0-9]+[[:space:]]+', '')
    FROM public.books b
   WHERE b.id = t.book_id
     AND b.source_platform = 'book_dash'
     AND b.source_id IN ('and-also', 'little-goat', 'look-up',
                         'the-rainbow-cloud', 'where-is-lulu', 'yes-you-can')
     AND t.text ~ '^Story spread [0-9]+[[:space:]]+'
  RETURNING t.id, t.text AS text_after
),
j AS (
  SELECT f.source_id, f.page_index, f.text_before, u.text_after
    FROM before f
    JOIN upd u ON u.id = f.id
)

-- [상세] 6행 — 사전/사후 대조
SELECT 1                                             AS sort,
       j.source_id                                   AS slug,
       j.page_index::text                            AS page_index,
       left(j.text_before, 52)                       AS text_before,
       left(j.text_after, 52)                        AS text_after,
       CASE
         WHEN j.text_after ~* 'story[[:space:]]+spread'
           THEN 'FAIL — 오염 잔존'
         WHEN btrim(j.text_after) = ''
           THEN 'FAIL — 본문이 비었다'
         WHEN length(j.text_after) >= length(j.text_before)
           THEN 'FAIL — 길이가 줄지 않았다'
         ELSE 'OK — ' || (length(j.text_before) - length(j.text_after))::text || '자 제거'
       END                                           AS row_check
  FROM j

-- [합계] 1행 — 게이트 판정
UNION ALL
SELECT 2, '(합계)',
       (SELECT count(DISTINCT source_id) FROM j)::text,
       (SELECT count(*) FROM j)::text || '행 갱신',
       (SELECT count(*) FROM j WHERE text_after ~* 'story[[:space:]]+spread')::text || '행 잔존',
       CASE
         WHEN (SELECT count(*) FROM j) = 6
          AND (SELECT count(DISTINCT source_id) FROM j) = 6
          AND (SELECT count(*) FROM j WHERE text_after ~* 'story[[:space:]]+spread') = 0
          AND (SELECT count(*) FROM j WHERE btrim(text_after) = '') = 0
           THEN 'PASS — 6권 6행 정리 완료. ROLLBACK을 COMMIT으로 고쳐 재실행할 것'
         WHEN (SELECT count(*) FROM j) = 0
           THEN 'SKIP — 갱신 대상 0행. 이미 정리됐다면 COMMIT 하지 말 것'
         ELSE 'FAIL — 기대(6권 6행)와 다르다. 수치를 워커에게 전달할 것'
       END

 ORDER BY sort, slug, page_index;


ROLLBACK;   -- ← 기대값 일치 시 COMMIT 으로 고쳐 재실행
