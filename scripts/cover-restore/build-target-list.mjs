/**
 * 3단계 1차 — ASb 표지 승격 대상 목록 확정. read-only (DB SELECT 2행 · Storage 접근 0).
 *
 * 입력: scripts/recon/out/cover_probe_failed.csv (2026-07-28 전수 측정)
 * 대상: ASb·is_active=true·표지404 743권 − 부분결손 1권(N=11932) + 별건 2권(Xam/Xama) = 744권
 * 각 권의 매니페스트(.txt)를 fetch해 본문 이미지 목록·첫 이미지 URL을 확보한다.
 *
 * 실행: node scripts/cover-restore/build-target-list.mjs [--limit 200]
 *   - 상태 파일(_target_state.json)에 진행분을 누적, 재실행 시 미처리분만 이어서 수행
 *   - 전 권 처리 완료 시 target-list.json 생성 + 요약 출력
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const RECON_CSV = path.join(REPO, 'scripts', 'recon', 'out', 'cover_probe_failed.csv');
const STATE_FILE = path.join(HERE, '_target_state.json');
const OUT_FILE = path.join(HERE, 'target-list.json');
const UA = 'kikibooks-cover-restore/1.0 (asb cover promotion; read-only manifest fetch)';
const ASB_IMAGE_BASE = 'https://africanstorybook.org/';
const MANIFEST_BASE = 'https://raw.githubusercontent.com/global-asp/asp-raw-db/master/data/';
const EXCLUDE_N = new Set([11932]); // Ekai's First Day In School — 부분결손, 별도 조사
const XAM_IDS = ['b0283a0b-5836-498f-9086-70e81e7c91c2', '08c9be27-76f8-44de-ae73-ebd140ffffb2'];

const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? Number(process.argv[i + 1]) : 200;
})();

// ── CSV (recon과 동일 파서) ────────────────────────────────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift().map((h) => h.replace(/^﻿/, ''));
  return rows.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// ── asb-parser.ts 동일 규칙(이미지 추출부) ─────────────────────────────────
function extractImages(raw) {
  const images = [];
  let section = 'header';
  for (const line of raw.split(/\r?\n/)) {
    if (section === 'done') break;
    const stripped = line.trim();
    const low = stripped.toLowerCase();
    if (section === 'header') {
      if (low.startsWith('page_text:')) section = 'page_text';
      else if (low.startsWith('images:')) section = 'images';
      continue;
    }
    if (section === 'page_text') { if (low.startsWith('images:')) section = 'images'; continue; }
    if (section === 'images') {
      if (low.startsWith('translations:') || low.startsWith('page_text:')) { section = 'done'; continue; }
      if (stripped && (stripped.includes('illustrations/') || low.endsWith('.png') || low.endsWith('.jpg') || low.endsWith('.jpeg'))) {
        images.push(/^https?:\/\//i.test(stripped) ? stripped.replace(/^http:\/\//i, 'https://') : ASB_IMAGE_BASE + stripped.replace(/^\/+/, ''));
      }
    }
  }
  return images;
}

async function fetchText(url, tries = 3) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 25_000);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: ctl.signal });
      const body = await res.text();
      return { status: res.status, body };
    } catch (e) {
      if (attempt === tries) return { status: null, error: `${e.name}: ${e.message}` };
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    } finally { clearTimeout(t); }
  }
}

// ── .env.local (값은 절대 출력하지 않는다) — Xam 2권 content_url SELECT 전용 ─
function loadEnv() {
  const txt = readFileSync(path.join(REPO, '.env.local'), 'utf8');
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error('.env.local 키 누락');
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SECRET_KEY };
}

// ── 모집단 구성 ────────────────────────────────────────────────────────────
const failed = parseCsv(readFileSync(RECON_CSV, 'utf8'));
const asb404 = failed
  .filter((r) => r.source_platform === 'african_storybook' && String(r.is_active).toLowerCase() === 'true' && r.status === '404')
  .map((r) => ({ book_id: r.book_id, title: r.title, coverN: Number((/covers\/(\d+)\.png/i.exec(r.cover_url) || [])[1]), origin: 'cover404' }))
  .filter((r) => Number.isFinite(r.coverN));
const excluded = asb404.filter((r) => EXCLUDE_N.has(r.coverN));
const population = asb404.filter((r) => !EXCLUDE_N.has(r.coverN));
console.log(`[INFO] ASb 표지404 활성 ${asb404.length}권 − 제외 ${excluded.length}권(N=${[...EXCLUDE_N].join(',')}) = ${population.length}권 + 별건 2권 예정`);

// ── 상태 로드 ──────────────────────────────────────────────────────────────
const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { books: {}, xam_resolved: false };

// ── 별건 2권: DB SELECT(읽기 전용 1회)로 content_url 확보 ──────────────────
if (!state.xam_resolved) {
  const { url, key } = loadEnv();
  const rest = `${url}/rest/v1/books?select=id,title,content_url,is_active&id=in.(${XAM_IDS.join(',')})`;
  const res = await fetch(rest, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) { console.error('[FAIL] DB SELECT', res.status, (await res.text()).slice(0, 200)); process.exit(1); }
  const rows = await res.json();
  console.log(`[INFO] 별건 2권 DB SELECT ${rows.length}행 (읽기 전용)`);
  for (const b of rows) {
    const n = Number((/data\/(\d+)\.txt/i.exec(b.content_url || '') || [])[1]);
    state.books[b.id] = {
      book_id: b.id, title: b.title, coverN: Number.isFinite(n) ? n : null,
      origin: 'xam_data_error', manifest_url: b.content_url || null,
      ...(b.content_url ? {} : { error: 'content_url 없음' }),
    };
  }
  state.xam_resolved = true;
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 1), 'utf8');
}

// 모집단을 상태에 등록 (미등록분만)
for (const b of population) {
  if (!state.books[b.book_id]) {
    state.books[b.book_id] = { ...b, manifest_url: `${MANIFEST_BASE}${b.coverN}.txt` };
  }
}

// ── 매니페스트 fetch (이번 실행분: 최대 LIMIT권, 동시 6) ────────────────────
const pending = Object.values(state.books).filter((b) => b.manifest_url && b.manifest_status === undefined);
const batch = pending.slice(0, LIMIT);
console.log(`[INFO] 미처리 ${pending.length}권 중 이번 실행 ${batch.length}권 (동시 6 · 재시도 3)`);

let done = 0;
async function worker(queue) {
  for (;;) {
    const b = queue.shift();
    if (!b) return;
    const res = await fetchText(b.manifest_url);
    b.manifest_status = res.status;
    if (res.status === 200) {
      const imgs = extractImages(res.body);
      b.image_count = imgs.length;
      b.images = imgs;
      b.first_image_url = imgs[0] ?? null;
      if (imgs.length === 0) b.error = '매니페스트에 이미지 0건';
    } else {
      b.error = res.error ?? `매니페스트 HTTP ${res.status}`;
    }
    done++;
    if (done % 50 === 0) console.log(`  … ${done}/${batch.length}`);
  }
}
const queue = [...batch];
await Promise.all(Array.from({ length: 6 }, () => worker(queue)));
writeFileSync(STATE_FILE, JSON.stringify(state, null, 1), 'utf8');
console.log(`[OK] 이번 실행 ${batch.length}권 처리 · 상태 저장`);

// ── 완료 시 target-list.json 생성 ──────────────────────────────────────────
const all = Object.values(state.books);
const remaining = all.filter((b) => b.manifest_url && b.manifest_status === undefined).length;
if (remaining > 0) {
  console.log(`[INFO] 남은 미처리 ${remaining}권 — 같은 명령을 재실행하세요.`);
} else {
  const ok = all.filter((b) => b.manifest_status === 200 && b.image_count > 0);
  const bad = all.filter((b) => !(b.manifest_status === 200 && b.image_count > 0));
  const out = {
    built_at: new Date().toISOString(),
    source: 'scripts/recon/out/cover_probe_failed.csv (2026-07-28) + DB SELECT 2행 (Xam/Xama)',
    excluded: excluded.map((b) => ({ ...b, reason: '부분결손 — 별도 조사' })),
    total: ok.length,
    failed_count: bad.length,
    failed: bad,
    books: ok.map((b) => ({
      book_id: b.book_id, title: b.title, coverN: b.coverN, origin: b.origin,
      manifest_url: b.manifest_url, image_count: b.image_count,
      first_image_url: b.first_image_url, images: b.images,
    })),
  };
  writeFileSync(OUT_FILE, JSON.stringify(out, null, 1), 'utf8');
  console.log(`\n=== 목록 확정 ===`);
  console.log(`  대상(정상): ${ok.length}권 · 실패/판정불가: ${bad.length}권 · 제외: ${excluded.length}권`);
  for (const b of bad) console.log(`  [실패] ${b.book_id} N=${b.coverN} ${b.error ?? b.manifest_status} ${String(b.title).slice(0, 40)}`);
  console.log(`[OK] ${path.relative(REPO, OUT_FILE)} 저장`);
}
