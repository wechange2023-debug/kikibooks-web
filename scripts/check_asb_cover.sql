-- 1) ASb 공개분 cover_url 실제 값 샘플 20건 (URL이 들어있는지 / 빈값인지 확인)
SELECT id, title, cover_url
FROM books
WHERE source_platform = 'african_storybook' AND is_active = true
LIMIT 20;

-- 2) ASb 공개분 중 cover_url이 null이거나 빈 문자열인 개수
SELECT COUNT(*) AS empty_cover
FROM books
WHERE source_platform = 'african_storybook' AND is_active = true
  AND (cover_url IS NULL OR cover_url = '');

-- 3) 소스별로 빈 cover 비율 비교 (GDL/Book Dash와 대조)
SELECT source_platform,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE cover_url IS NULL OR cover_url = '') AS empty_cover
FROM books
WHERE is_active = true
GROUP BY source_platform;
