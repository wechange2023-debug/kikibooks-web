-- =============================================================================
-- 001_initial_schema.sql — 키키북스 초기 스키마
--
-- 적용처: Supabase Dashboard → SQL Editor → 본 파일 전체 붙여넣기 → Run
-- 참조:
--   - docs/guidelines/license-rules.md 3.1·3.2절 (CHECK 제약 + 트리거)
--   - claude.md 2절 Hard Rules 1·2·6·8
--   - docs/adr/0001-tech-stack.md (RLS 채택 근거)
--
-- ★ 본 마이그레이션은 멱등(idempotent)하지 않다. 한 번만 실행한다.
-- ★ 002 이후는 ALTER TABLE 위주의 증분 변경.
-- =============================================================================

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()


-- =============================================================================
-- 1. profiles — auth.users와 1:1, 부모(또는 관리자/큐레이터) 프로필
-- =============================================================================
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'parent'
                  CHECK (role IN ('parent', 'admin', 'curator')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE profiles IS '학부모(또는 관리자) 계정. auth.users.id를 PK로 공유.';


-- =============================================================================
-- 2. children — 자녀 프로필 (1 부모 N 자녀)
-- =============================================================================
CREATE TABLE children (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  age            INT CHECK (age BETWEEN 3 AND 7),
  current_level  INT NOT NULL DEFAULT 1
                   CHECK (current_level BETWEEN 1 AND 5),
  points         INT NOT NULL DEFAULT 0
                   CHECK (points >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_children_parent_id ON children(parent_id);

COMMENT ON TABLE children IS '자녀 프로필. 만 3~7세 한정, 레벨 1~5 매핑은 design-system.md 1.8절 컬러와 동기.';


-- =============================================================================
-- 3. books ★ 핵심 테이블 — license-rules.md 3.1절 그대로
-- =============================================================================
CREATE TABLE books (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  source_platform   TEXT NOT NULL
                      CHECK (source_platform IN (
                        'book_dash',     -- Book Dash (CC BY 4.0)
                        'gdl',           -- Global Digital Library (CC BY / CC BY-SA)
                        'librivox',      -- LibriVox (CC0 오디오)
                        'pg',            -- Project Gutenberg (PD)
                        'jybooks',       -- 협상 예정 (Phase 2+)
                        'wjjr',          -- 웅진주니어 협상 예정 (Phase 2+)
                        'magic_light'    -- Magic Light Pictures (Gruffalo, ADR-0001 5.3)
                      )),
  source_id         TEXT NOT NULL,

  title             TEXT NOT NULL,
  cover_url         TEXT NOT NULL,
  content_url       TEXT NOT NULL,
  content_type      TEXT NOT NULL
                      CHECK (content_type IN ('html', 'epub', 'h5p', 'pdf')),

  language          TEXT NOT NULL DEFAULT 'en',
  level             INT CHECK (level BETWEEN 1 AND 5),
  age_min           INT,
  age_max           INT,

  license           TEXT NOT NULL
                      CHECK (license IN (
                        'cc-by-4-0',
                        'cc-by-sa-4-0',
                        'cc0',
                        'public-domain'
                      )),

  author            TEXT,
  illustrator       TEXT,
  original_url      TEXT NOT NULL,

  -- ★ Hard Rule 1: NOT NULL 강제. CC BY 의무 어트리뷰션을 DB가 차단.
  attribution_text  TEXT NOT NULL,

  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (source_platform, source_id)
);

CREATE INDEX idx_books_source_platform ON books(source_platform);
CREATE INDEX idx_books_level           ON books(level);
CREATE INDEX idx_books_language        ON books(language);
CREATE INDEX idx_books_is_active       ON books(is_active);

COMMENT ON TABLE books IS
  'CC BY 4.0 / CC BY-SA / CC0 / PD 콘텐츠만 적재. NC·ND는 트리거에서 차단.';
COMMENT ON COLUMN books.attribution_text IS
  '★ 절대 NULL 금지 (Hard Rule 1). license-rules.md 4.2절 포맷 준수.';
COMMENT ON COLUMN books.license IS
  '★ CHECK 제약 + 트리거 이중 차단 (Hard Rule 2). NC/ND는 INSERT 자체 실패.';


-- =============================================================================
-- 4. reading_sessions — 자녀별 읽기 세션
-- =============================================================================
CREATE TABLE reading_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id      UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  book_id       UUID NOT NULL REFERENCES books(id),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,  -- NULL이면 진행 중
  pages_read    INT NOT NULL DEFAULT 0
                  CHECK (pages_read >= 0),
  is_completed  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_reading_sessions_child_id   ON reading_sessions(child_id);
CREATE INDEX idx_reading_sessions_book_id    ON reading_sessions(book_id);
CREATE INDEX idx_reading_sessions_started_at ON reading_sessions(started_at);


-- =============================================================================
-- 5. favorites — 자녀별 책 찜
-- =============================================================================
CREATE TABLE favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  book_id     UUID NOT NULL REFERENCES books(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (child_id, book_id)
);


-- =============================================================================
-- 6. child_badges — 완독·스트릭 보상 뱃지
-- =============================================================================
CREATE TABLE child_badges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  badge_code  TEXT NOT NULL,
  earned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (child_id, badge_code)
);


-- =============================================================================
-- 7. 트리거 — license-rules.md 3.2절 (★ Hard Rule 2 — 절대 DROP/DISABLE 금지)
-- =============================================================================
CREATE OR REPLACE FUNCTION enforce_commercial_license()
RETURNS trigger AS $$
BEGIN
  IF NEW.license NOT IN ('cc-by-4-0', 'cc-by-sa-4-0', 'cc0', 'public-domain') THEN
    RAISE EXCEPTION '상업 사용 불가 라이선스 차단: %', NEW.license;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER books_license_check
  BEFORE INSERT OR UPDATE ON books
  FOR EACH ROW EXECUTE FUNCTION enforce_commercial_license();


-- =============================================================================
-- 8. updated_at 자동 갱신 트리거 (표준)
-- =============================================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_touch_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER children_touch_updated_at
  BEFORE UPDATE ON children
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- =============================================================================
-- 9. Row Level Security (★ Hard Rule 6 — 자녀 데이터 격리의 핵심)
-- =============================================================================
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE children         ENABLE ROW LEVEL SECURITY;
ALTER TABLE books            ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites        ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_badges     ENABLE ROW LEVEL SECURITY;


-- 9.1 books — 카탈로그는 모두에게 공개 SELECT, 쓰기는 secret 키만
--     (PostgreSQL은 RLS 정책이 없으면 모든 작업 거부 → service_role/secret만 통과)
CREATE POLICY "books are viewable by everyone"
  ON books
  FOR SELECT
  USING (true);


-- 9.2 profiles — 본인 행만
CREATE POLICY "users can view own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users can insert own profile"
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id);


-- 9.3 children — 본인 자녀만
CREATE POLICY "parents can view own children"
  ON children
  FOR SELECT
  USING (parent_id = auth.uid());

CREATE POLICY "parents can insert own children"
  ON children
  FOR INSERT
  WITH CHECK (parent_id = auth.uid());

CREATE POLICY "parents can update own children"
  ON children
  FOR UPDATE
  USING (parent_id = auth.uid());

CREATE POLICY "parents can delete own children"
  ON children
  FOR DELETE
  USING (parent_id = auth.uid());


-- 9.4 reading_sessions — 본인 자녀의 세션만
CREATE POLICY "parents can view own children sessions"
  ON reading_sessions
  FOR SELECT
  USING (child_id IN (SELECT id FROM children WHERE parent_id = auth.uid()));

CREATE POLICY "parents can insert own children sessions"
  ON reading_sessions
  FOR INSERT
  WITH CHECK (child_id IN (SELECT id FROM children WHERE parent_id = auth.uid()));

CREATE POLICY "parents can update own children sessions"
  ON reading_sessions
  FOR UPDATE
  USING (child_id IN (SELECT id FROM children WHERE parent_id = auth.uid()));


-- 9.5 favorites — 본인 자녀의 찜만
CREATE POLICY "parents can view own children favorites"
  ON favorites
  FOR SELECT
  USING (child_id IN (SELECT id FROM children WHERE parent_id = auth.uid()));

CREATE POLICY "parents can insert own children favorites"
  ON favorites
  FOR INSERT
  WITH CHECK (child_id IN (SELECT id FROM children WHERE parent_id = auth.uid()));

CREATE POLICY "parents can delete own children favorites"
  ON favorites
  FOR DELETE
  USING (child_id IN (SELECT id FROM children WHERE parent_id = auth.uid()));


-- 9.6 child_badges — 본인 자녀의 뱃지만 SELECT (INSERT는 시스템이 책임)
CREATE POLICY "parents can view own children badges"
  ON child_badges
  FOR SELECT
  USING (child_id IN (SELECT id FROM children WHERE parent_id = auth.uid()));


-- =============================================================================
-- 끝. 다음 마이그레이션은 002_<목적>.sql 형식으로 작성.
-- =============================================================================
