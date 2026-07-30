/**
 * 팀장 지시(2026-07-30): update-cover-urls.sql이 SQL Editor에서 42P01(백업 테이블 미반영)로
 * 실패해 단계 실행용 3파일로 분할한다. 내용 변경 없이 재배치 · BEGIN/ROLLBACK 제거.
 *   step1-backup.sql  — 백업 테이블 생성 + 건수 검증
 *   step2-update.sql  — UPDATE 745건 + 검증 SELECT 3종 + 표본 5건
 *   step3-verify.sql  — 화면 검증 후 최종 확인용
 * 트랜잭션이 없으므로 되돌리기는 rollback-cover-urls.sql(기존) 담당.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(HERE, 'update-cover-urls.sql'), 'utf8').replace(/\r\n/g, '\n');

const idx1 = src.indexOf('-- 1)');
const idx2 = src.indexOf('-- 2)');
const idx3 = src.indexOf('-- 3)');
const idxEnd = src.indexOf('-- ⚠ 확정');
if ([idx1, idx2, idx3, idxEnd].some((i) => i < 0)) { console.error('[FAIL] 마커 못 찾음'); process.exit(1); }

const sec1 = src.slice(idx1, idx2).trimEnd(); // CREATE TABLE + 백업 건수 확인
const sec2 = src.slice(idx2, idx3).trimEnd(); // UPDATE 745건
const sec34 = src.slice(idx3, idxEnd).trimEnd(); // 검증 3종 + 표본 5건

const head = (title, note) => `-- ============================================================================
-- ${title} (3단계 2차 분할본, 2026-07-30)
-- ${note}
-- 트랜잭션 없음 — 되돌리기는 rollback-cover-urls.sql 또는 백업 테이블 복원 사용.
-- ============================================================================

`;

writeFileSync(path.join(HERE, 'step1-backup.sql'),
  head('STEP 1 — 갱신 전 백업', '실행 후 backup_count = 745 확인. 745가 아니면 STEP 2로 넘어가지 말 것.')
  + sec1 + '\n', 'utf8');

writeFileSync(path.join(HERE, 'step2-update.sql'),
  head('STEP 2 — cover_url 갱신 745건', 'STEP 1의 backup_count=745 확인 후 실행. 결과 3값 모두 745 + 표본 5건 확인.')
  + sec2 + '\n\n' + sec34 + '\n', 'utf8');

writeFileSync(path.join(HERE, 'step3-verify.sql'), `-- ============================================================================
-- STEP 3 — 화면 검증 후 최종 확인 (3단계 2차 분할본, 2026-07-30)
-- 서비스 화면에서 ASb 표지 노출을 육안 확인한 뒤 실행한다.
-- ============================================================================

-- 1) 갱신 총수 — 745 이어야 함
SELECT COUNT(*) AS updated_total
FROM books
WHERE cover_url LIKE '%/storage/v1/object/public/book-covers/asb-%';

-- 2) 백업 총수 — 745 이어야 함
SELECT COUNT(*) AS backup_count FROM cover_url_backup_20260730;

-- 3) 표본 5건 재확인 (old → new)
SELECT b.id, b.title, bk.cover_url AS old_url, b.cover_url AS new_url
FROM books b JOIN cover_url_backup_20260730 bk ON bk.id = b.id
LIMIT 5;

-- 4) ASb 활성 도서 중 아직 외부 covers/ 경로가 남은 책 — 0 이어야 함
--    (대상 745권 밖의 ASb 책은 원래 정상 표지라 africanstorybook.org URL이어도 정상.
--     이 검증은 '깨졌던 745권'이 전부 전환됐는지를 백업 테이블 기준으로 본다)
SELECT COUNT(*) AS not_migrated
FROM books b JOIN cover_url_backup_20260730 bk ON bk.id = b.id
WHERE b.cover_url NOT LIKE '%/book-covers/asb-%';
`, 'utf8');

console.log('[OK] step1-backup.sql / step2-update.sql / step3-verify.sql 생성');
