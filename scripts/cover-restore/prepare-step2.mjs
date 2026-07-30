/**
 * 3단계 2차 STEP 2 — 업로드 준비물 생성. DB 접근 0 · Storage 접근 0 · 파일 생성만.
 *
 * 산출물:
 *   1) scripts/cover-restore/upload/asb-{N}.{ext}       — 업로드 전용 폴더 (745파일, flat)
 *   2) scripts/cover-restore/update-cover-urls.sql       — 백업 테이블 + 745건 UPDATE + 검증, ROLLBACK 종결
 *   3) scripts/cover-restore/rollback-cover-urls.sql     — 이전 실측 DB값 VALUES 기반 되돌림, ROLLBACK 종결
 *   4) scripts/cover-restore/cover_url_backup_20260730.csv — 이전 실측 DB값 백업 (id,coverN,old_cover_url)
 *
 * old_cover_url 출처(2026-07-28 전수 측정 시점의 실제 DB값):
 *   - 표지404 743권: cover_probe_failed.csv의 cover_url
 *   - 별건 2권: cover_probe_state.json의 non_url 값('Xam'/'Xama')
 * ADR-0032 롤백 원칙 준수: 죽은 URL·오류 값도 그대로 baseline 보존.
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const DL_DIR = path.join(HERE, 'downloads');
const UP_DIR = path.join(HERE, 'upload');
const DATE_TAG = '20260730';

// ── 입력 로드 ──────────────────────────────────────────────────────────────
const list = JSON.parse(readFileSync(path.join(HERE, 'target-list.json'), 'utf8'));
const dlState = JSON.parse(readFileSync(path.join(HERE, '_download_state.json'), 'utf8'));
const probeState = JSON.parse(readFileSync(path.join(REPO, 'scripts', 'recon', 'out', 'cover_probe_state.json'), 'utf8'));

// NEXT_PUBLIC_SUPABASE_URL만 추출 (public 변수 — 클라이언트 번들에 노출되는 값)
const envTxt = readFileSync(path.join(REPO, '.env.local'), 'utf8');
const SUPABASE_URL = (/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+?)\s*$/m.exec(envTxt) || [])[1]?.replace(/^["']|["']$/g, '');
if (!SUPABASE_URL) { console.error('[FAIL] NEXT_PUBLIC_SUPABASE_URL 없음'); process.exit(1); }
const PUBLIC_BASE = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/book-covers`;

// 이전 DB값 매핑
const xamOld = Object.fromEntries(probeState.non_url.map((r) => [r.id, r.cover_url]));

// ── 745권 매핑 구성 + 업로드 폴더 복사 ─────────────────────────────────────
mkdirSync(UP_DIR, { recursive: true });
const rows = [];
let copied = 0;
for (const b of list.books) {
  const s = dlState.books[b.book_id];
  if (!s || s.status !== 'ok') { console.error(`[FAIL] 다운로드 미완료: ${b.book_id}`); process.exit(1); }
  const src = path.join(DL_DIR, `${b.book_id}.${s.ext}`);
  if (!existsSync(src)) { console.error(`[FAIL] 파일 없음: ${src}`); process.exit(1); }
  const key = `asb-${b.coverN}.${s.ext}`;
  copyFileSync(src, path.join(UP_DIR, key));
  copied++;
  const oldUrl = b.origin === 'xam_data_error'
    ? xamOld[b.book_id]
    : `https://africanstorybook.org/illustrations/covers/${b.coverN}.png`;
  rows.push({ id: b.book_id, coverN: b.coverN, ext: s.ext, old: oldUrl, next: `${PUBLIC_BASE}/${key}` });
}
console.log(`[OK] upload/ 복사 ${copied}파일 (asb-{N}.{ext}, flat)`);

const esc = (s) => String(s).replace(/'/g, "''");

// ── update-cover-urls.sql ──────────────────────────────────────────────────
const updateValues = rows.map((r) => `  ('${r.id}'::uuid, '${esc(r.next)}')`).join(',\n');
const updateSql = `-- ============================================================================
-- ASb 745권 표지 승격 — books.cover_url 갱신 (3단계 2차, ${DATE_TAG})
-- 실행: 팀장이 Supabase SQL Editor에서 직접 실행 (워커 DB 쓰기 금지 규율)
-- ⚠ 이 파일은 ROLLBACK으로 끝난다. 결과 확인 후 변경을 확정하려면
--    마지막 줄 ROLLBACK; 을 COMMIT; 으로 바꿔 다시 실행한다.
-- 전제: Storage book-covers 버킷에 upload/ 745파일 업로드 완료 + 표본 URL 공개 접근 확인
-- 전례: ADR-0032 (Book Dash 206권). cover_url만 변경, attribution/license/original_url 미터치.
-- ============================================================================

BEGIN;

-- 1) 갱신 직전 실제 DB값 백업 테이블 (런타임 baseline)
CREATE TABLE cover_url_backup_${DATE_TAG} AS
SELECT id, cover_url
FROM books
WHERE id IN (
${rows.map((r) => `  '${r.id}'::uuid`).join(',\n')}
);

-- 백업 건수 확인 — 745 이어야 함
SELECT COUNT(*) AS backup_count FROM cover_url_backup_${DATE_TAG};

-- 2) 745건 UPDATE (id 매핑, VALUES 기반)
UPDATE books AS b
SET cover_url = v.new_url
FROM (VALUES
${updateValues}
) AS v(id, new_url)
WHERE b.id = v.id
  AND b.source_platform = 'african_storybook';

-- 3) 검증 — 세 값 모두 745 이어야 함
SELECT
  (SELECT COUNT(*) FROM books WHERE cover_url LIKE '%/storage/v1/object/public/book-covers/asb-%') AS updated_total,
  (SELECT COUNT(*) FROM books b JOIN cover_url_backup_${DATE_TAG} bk ON bk.id = b.id
     WHERE b.cover_url LIKE '%/book-covers/asb-%')                                                  AS updated_in_backup,
  (SELECT COUNT(*) FROM cover_url_backup_${DATE_TAG})                                               AS backup_count;

-- 4) 표본 5건 육안 확인
SELECT b.id, b.title, bk.cover_url AS old_url, b.cover_url AS new_url
FROM books b JOIN cover_url_backup_${DATE_TAG} bk ON bk.id = b.id
LIMIT 5;

-- ⚠ 확정 시 아래를 COMMIT; 으로 변경
ROLLBACK;
`;
writeFileSync(path.join(HERE, 'update-cover-urls.sql'), updateSql, 'utf8');

// ── rollback-cover-urls.sql (2026-07-28 실측 DB값 baseline) ────────────────
const rollbackValues = rows.map((r) => `  ('${r.id}'::uuid, '${esc(r.old)}')`).join(',\n');
const rollbackSql = `-- ============================================================================
-- ASb 745권 표지 승격 롤백 — ${DATE_TAG} 갱신 이전 값으로 복원
-- baseline: 2026-07-28 전수 측정 시점의 실제 DB값 (ADR-0032 원칙: 죽은 URL·오류값도 그대로 복원)
--   - 743권: africanstorybook.org/illustrations/covers/{N}.png (당시 404였던 값 그대로)
--   - 2권: 'Xam' / 'Xama' (데이터 오류값 그대로)
-- 대안: 갱신 시 만든 cover_url_backup_${DATE_TAG} 테이블이 살아 있으면 그쪽 복원이 더 정확:
--   UPDATE books b SET cover_url = bk.cover_url FROM cover_url_backup_${DATE_TAG} bk WHERE b.id = bk.id;
-- ⚠ 이 파일도 ROLLBACK으로 끝난다. 확정 시 마지막 줄을 COMMIT; 으로 변경.
-- ============================================================================

BEGIN;

UPDATE books AS b
SET cover_url = v.old_url
FROM (VALUES
${rollbackValues}
) AS v(id, old_url)
WHERE b.id = v.id
  AND b.source_platform = 'african_storybook';

-- 검증 — 0 이어야 함 (asb-* Storage URL이 남아있지 않아야)
SELECT COUNT(*) AS remaining_new_urls
FROM books
WHERE cover_url LIKE '%/storage/v1/object/public/book-covers/asb-%';

ROLLBACK;
`;
writeFileSync(path.join(HERE, 'rollback-cover-urls.sql'), rollbackSql, 'utf8');

// ── 백업 CSV ───────────────────────────────────────────────────────────────
const csv = 'id,coverN,old_cover_url\n' + rows.map((r) => `${r.id},${r.coverN},"${String(r.old).replace(/"/g, '""')}"`).join('\n') + '\n';
writeFileSync(path.join(HERE, `cover_url_backup_${DATE_TAG}.csv`), '﻿' + csv, 'utf8');

// ── 요약 ───────────────────────────────────────────────────────────────────
console.log(`[OK] update-cover-urls.sql (UPDATE ${rows.length}건 · ROLLBACK 종결)`);
console.log(`[OK] rollback-cover-urls.sql (복원 ${rows.length}건 · ROLLBACK 종결)`);
console.log(`[OK] cover_url_backup_${DATE_TAG}.csv (${rows.length}행)`);
console.log('\n표본 public URL 3건 (업로드 후 접근 확인용):');
for (const r of [rows[0], rows[Math.floor(rows.length / 2)], rows[rows.length - 1]]) console.log(`  ${r.next}`);
