-- step3b_verify_remaining3.sql — Book Dash STEP 3 잔여 3권 진단 (읽기 전용)
-- 목적: cover_url 미이관 3권의 실제 DB source_id 키 형식(full-slug vs UUID)과
--       현재 cover_url 값을 확정한다. DB/Storage 일절 변경 없음(SELECT only).
-- 실행: 팀장(Supabase SQL Editor). 워커는 파일 생성만.
--
-- 배경(중요): step3_update_cover_url.sql(206행)은 혼합 키였다 — UUID 키 54행 + slug 키 152행.
--   아래 3권의 UUID는 그 파일에 '이미' 존재한다(라인 34/54/63, UUID로 키잉).
--   그럼에도 cover_url이 안 바뀌었다면, 이 3권의 실제 DB source_id가 UUID가 아니라
--   full-slug일 가능성이 크다(WHERE b.source_id = v.source_id 조인 미스매치).
--   Storage 실제 객체명은 UUID 기반(bookdash-{UUID}.webp, manifest/upload.py 근거)이다.
--
-- 후보 매핑(task full-slug ↔ github.io 경로 slug ↔ UUID ↔ Storage 대상 URL):
--   little-sock-and-the-tiny-creatures | little-sock         | 9c9f4da4-fe46-11e5-86aa-5e5517507c66
--   maddy-moonas-menagerie             | maddy-moona         | 9c9e7dca-fe46-11e5-86aa-5e5517507c66
--   mrs-penguins-perfect-palace        | mrs-penguins-palace | 9c9eb7e0-fe46-11e5-86aa-5e5517507c66

-- [A] full-slug 로 매칭되는가? (기대: 여기서 3행이 나오면 DB 키 = full-slug)
SELECT source_id, title, is_active, cover_url
FROM books
WHERE source_platform = 'book_dash'
  AND source_id IN (
    'little-sock-and-the-tiny-creatures',
    'maddy-moonas-menagerie',
    'mrs-penguins-perfect-palace'
  )
ORDER BY source_id;

-- [B] UUID 로 매칭되는가? (기대: 여기서 3행이 나오면 DB 키 = UUID)
SELECT source_id, title, is_active, cover_url
FROM books
WHERE source_platform = 'book_dash'
  AND source_id IN (
    '9c9f4da4-fe46-11e5-86aa-5e5517507c66',
    '9c9e7dca-fe46-11e5-86aa-5e5517507c66',
    '9c9eb7e0-fe46-11e5-86aa-5e5517507c66'
  )
ORDER BY source_id;

-- [C] 현재 cover_url 이 아직 github.io(미이관)인지 확인.
--     제목으로 3권을 폭넓게 훑어 [A]/[B] 어느 쪽이 실제 행인지 title 로 교차 확인.
SELECT source_id, title, cover_url,
       (cover_url LIKE '%bookdash.github.io%') AS still_github_io,
       (cover_url LIKE '%/storage/v1/object/public/book-covers/%') AS on_storage
FROM books
WHERE source_platform = 'book_dash'
  AND (
    title ILIKE '%little sock%'
    OR title ILIKE '%maddy moona%'
    OR title ILIKE '%penguin%palace%'
  )
ORDER BY title;

-- 판정:
--   [A]가 3행 → step3c 의 WHERE source_id = full-slug 그대로 실행.
--   [B]가 3행 → step3c 의 WHERE 를 UUID 로 교체 후 실행(파일 하단 주석의 대안 블록 참조).
--   어느 쪽이든 SET cover_url 은 UUID 기반 Storage URL 고정(실제 객체가 그 이름이므로).
