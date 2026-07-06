-- tts_recon_cohort.sql — v1 html 오디오 대상 코호트 정찰 (읽기 전용, SELECT only)
-- 목적: 작업지시서의 "v1 html 54권"과 문서의 "39권" 불일치를 DB 실측으로 확정하고,
--       남은 대상 목록(표지 문장·글자수·비용 산정 입력)을 뽑는다.
-- 실행: 팀장(Supabase SQL Editor). DB/Storage 일절 변경 없음. Polly 호출 없음(비용 0).
-- 완료분 5권(로컬 산출물 기준)은 content_url 내 slug로 식별 → done 플래그로 표시.

-- ─────────────────────────────────────────────────────────────
-- [Q1] 코호트 총 권수 (39 vs 54 즉시 판정)
SELECT
  COUNT(*)                                   AS total_v1_html,
  COUNT(*) FILTER (WHERE is_active)          AS active_v1_html,
  COUNT(*) FILTER (WHERE NOT is_active)      AS inactive_v1_html
FROM books
WHERE source_platform = 'book_dash'
  AND content_type = 'html';

-- ─────────────────────────────────────────────────────────────
-- [Q2] 남은 대상 목록 (CSV로 내보내기) — 완료 5권은 done=true로 표시
--   컬럼: id, source_id, title, author, illustrator, content_url, is_active, done
--   entity_in_title/author = 표지 문장 재료에 HTML 엔티티(&…;)가 남아있는지 사전 표시.
SELECT
  b.id,
  b.source_id,
  b.title,
  b.author,
  b.illustrator,
  b.content_url,
  b.is_active,
  (b.content_url ~ '/(a-beautiful-day|a-dancers-tale|a-fish-and-a-gift|a-house-for-mouse|a-tiny-seed)/en/')
                                             AS done,
  (b.title  ~ '&[a-zA-Z]+;|&#[0-9]+;')       AS entity_in_title,
  (b.author ~ '&[a-zA-Z]+;|&#[0-9]+;')       AS entity_in_author
FROM books b
WHERE b.source_platform = 'book_dash'
  AND b.content_type = 'html'
ORDER BY done, b.title;

-- ─────────────────────────────────────────────────────────────
-- [Q3] 요약: 남은 대상 권수(완료 제외) + 엔티티 이슈 권수
SELECT
  COUNT(*) FILTER (
    WHERE NOT (content_url ~ '/(a-beautiful-day|a-dancers-tale|a-fish-and-a-gift|a-house-for-mouse|a-tiny-seed)/en/')
  ) AS remaining_after_done,
  COUNT(*) FILTER (
    WHERE (title ~ '&[a-zA-Z]+;|&#[0-9]+;') OR (author ~ '&[a-zA-Z]+;|&#[0-9]+;')
  ) AS books_with_entity_issue
FROM books
WHERE source_platform = 'book_dash'
  AND content_type = 'html';
