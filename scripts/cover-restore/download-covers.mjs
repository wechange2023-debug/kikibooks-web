/**
 * 3단계 1차 STEP 2 — 표지 승격용 본문 첫 이미지 다운로드. read-only(외부 GET만).
 *
 * 입력: scripts/cover-restore/target-list.json (745권)
 * 출력: scripts/cover-restore/downloads/{book_id}.{png|jpg}
 *
 * 실행: node scripts/cover-restore/download-covers.mjs [--limit 50]
 *   - 상태 파일(_download_state.json) 누적, 재실행 시 미처리분만 이어서 수행
 *   - 각 권: images 배열을 순서대로 시도, 첫 200+이미지 매직바이트 응답을 저장
 *   - 네트워크 오류는 3회 지수 백오프 재시도 (정찰 2-2절: fetch failed를 404로 오판 금지)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIST = path.join(HERE, 'target-list.json');
const STATE_FILE = path.join(HERE, '_download_state.json');
const DL_DIR = path.join(HERE, 'downloads');
const UA = 'kikibooks-cover-restore/1.0 (cover promotion download)';

const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? Number(process.argv[i + 1]) : 50;
})();

function sniff(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  return null;
}

async function get(url, tries = 3) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 30_000);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: ctl.signal });
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: res.status, buf };
    } catch (e) {
      if (attempt === tries) return { status: null, error: `${e.name}: ${e.message}` };
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    } finally { clearTimeout(t); }
  }
}

mkdirSync(DL_DIR, { recursive: true });
const list = JSON.parse(readFileSync(LIST, 'utf8'));
const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { books: {} };

const pending = list.books.filter((b) => {
  const s = state.books[b.book_id];
  return !s || (s.status !== 'ok' && s.status !== 'all_images_failed');
});
const batch = pending.slice(0, LIMIT);
console.log(`[INFO] 대상 ${list.books.length}권 · 완료 ${list.books.length - pending.length}권 · 이번 배치 ${batch.length}권 (동시 3 · 재시도 3)`);

let done = 0, okCount = 0, failCount = 0;
async function work(queue) {
  for (;;) {
    const b = queue.shift();
    if (!b) return;
    const rec = { title: b.title, coverN: b.coverN, tried: [] };
    for (let i = 0; i < b.images.length; i++) {
      const url = b.images[i];
      const r = await get(url);
      if (r.status === 200 && r.buf) {
        const ext = sniff(r.buf);
        if (ext) {
          const file = path.join(DL_DIR, `${b.book_id}.${ext}`);
          writeFileSync(file, r.buf);
          rec.status = 'ok';
          rec.used_index = i + 1;
          rec.used_url = url;
          rec.ext = ext;
          rec.bytes = r.buf.length;
          break;
        }
        rec.tried.push({ url, status: 200, note: 'not-image-bytes' });
      } else {
        rec.tried.push({ url, status: r.status, error: r.error });
      }
    }
    if (rec.status !== 'ok') rec.status = 'all_images_failed';
    state.books[b.book_id] = rec;
    rec.status === 'ok' ? okCount++ : failCount++;
    done++;
    if (done % 10 === 0) console.log(`  … ${done}/${batch.length}`);
  }
}
const queue = [...batch];
await Promise.all(Array.from({ length: 3 }, () => work(queue)));
writeFileSync(STATE_FILE, JSON.stringify(state, null, 1), 'utf8');

const all = Object.values(state.books);
const remaining = list.books.length - all.length + all.filter((s) => s.status !== 'ok' && s.status !== 'all_images_failed').length;
console.log(`[OK] 배치 완료: 성공 ${okCount} · 실패 ${failCount} · 누적 ${all.filter((s) => s.status === 'ok').length}/${list.books.length} · 남은 ${remaining}권`);
if (remaining === 0) {
  const oks = all.filter((s) => s.status === 'ok');
  const fails = Object.entries(state.books).filter(([, s]) => s.status === 'all_images_failed');
  const totalBytes = oks.reduce((a, s) => a + (s.bytes || 0), 0);
  const nonFirst = oks.filter((s) => s.used_index > 1).length;
  console.log(`\n=== 다운로드 전체 완료 ===`);
  console.log(`  성공 ${oks.length}권 · 실패 ${fails.length}권 · 총 ${(totalBytes / 1024 / 1024).toFixed(1)}MB · 첫 이미지 아닌 대체 사용 ${nonFirst}권`);
  for (const [id, s] of fails) console.log(`  [실패] ${id} N=${s.coverN} ${String(s.title).slice(0, 40)} tried=${s.tried.map((t) => t.status ?? t.error).join(',')}`);
}
