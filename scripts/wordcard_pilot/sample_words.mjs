/**
 * 단어카드 한글 뜻 — 검수용 표본 150개 추출 (지시서 E-2c-1 STEP 2).
 *
 * 정본 입력: scripts/wordplay/out/wordplay-dryrun-YYYYMMDD.json 의 `w0`
 *   - w0.unique_words      고유 단어 1,855개 (청취 제외 27종은 STOPWORDS 단계에서 이미 빠짐)
 *   - w0.word_book_counts  단어별 "카드로 선정된 책 수" (모집단 858권 · 렌더 856권)
 *
 * 추출 규칙:
 *   ① 빈도 상위 50 — word_book_counts 내림차순, 동점은 단어 오름차순(결정적)
 *   ② 나머지에서 무작위 100 — seed=42 고정 mulberry32 + Fisher-Yates (재현 가능)
 *   중복 제거 후 150개.
 *
 * ★ DB·Storage 접근 0건. 로컬 JSON만 읽는다.
 *
 * 실행:
 *   node scripts/wordcard_pilot/sample_words.mjs
 *   node scripts/wordcard_pilot/sample_words.mjs --words-json <경로>
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DRYRUN_DIR = path.join(ROOT, 'scripts', 'wordplay', 'out');

const TOP_N = 50;
const RANDOM_N = 100;
const SEED = 42;

/** 결정적 PRNG — 같은 seed면 언제 어디서 돌려도 같은 수열. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveWordsJson(argPath) {
  if (argPath) return path.resolve(argPath);
  const files = fs
    .readdirSync(DRYRUN_DIR)
    .filter((f) => /^wordplay-dryrun-\d+\.json$/.test(f))
    .sort();
  if (files.length === 0) {
    console.error('[STOP] 드라이런 산출물이 없습니다: ' + DRYRUN_DIR);
    process.exit(1);
  }
  return path.join(DRYRUN_DIR, files[files.length - 1]); // 최신본
}

const argIdx = process.argv.indexOf('--words-json');
const srcPath = resolveWordsJson(argIdx >= 0 ? process.argv[argIdx + 1] : null);
const data = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
const w0 = data.w0;

if (!w0 || !Array.isArray(w0.unique_words) || !w0.word_book_counts) {
  console.error('[STOP] w0.unique_words / w0.word_book_counts 가 없습니다: ' + srcPath);
  process.exit(1);
}

const words = w0.unique_words;
const counts = w0.word_book_counts;

// ── 정합성 검사 — 목록과 빈도표가 어긋나면 STOP ──
if (new Set(words).size !== words.length) {
  console.error('[STOP] unique_words에 중복이 있습니다.');
  process.exit(1);
}
const missing = words.filter((w) => !(w in counts));
if (missing.length) {
  console.error('[STOP] 빈도표에 없는 단어 ' + missing.length + '개: ' + missing.slice(0, 5).join(', '));
  process.exit(1);
}

// ── ① 빈도 상위 50 ──
const ranked = [...words].sort((a, b) => counts[b] - counts[a] || (a < b ? -1 : a > b ? 1 : 0));
const top = ranked.slice(0, TOP_N);
const topSet = new Set(top);

// 경계 동점 보고 — 50위와 51위의 빈도가 같으면 컷이 자의적임을 드러낸다.
const cutTie = counts[ranked[TOP_N - 1]] === counts[ranked[TOP_N]];

// ── ② 나머지에서 무작위 100 (seed=42) ──
const rest = ranked.filter((w) => !topSet.has(w)).sort(); // 셔플 전 결정적 초기 순서
const rnd = mulberry32(SEED);
for (let i = rest.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [rest[i], rest[j]] = [rest[j], rest[i]];
}
const picked = rest.slice(0, RANDOM_N);

const sample = [
  ...top.map((w) => ({ word: w, count: counts[w], basis: '빈도상위' })),
  ...picked.map((w) => ({ word: w, count: counts[w], basis: '무작위' })),
];

if (new Set(sample.map((r) => r.word)).size !== sample.length) {
  console.error('[STOP] 표본에 중복이 있습니다.');
  process.exit(1);
}

const outDir = path.join(HERE, 'out');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'sample_150_words.tsv');
fs.writeFileSync(
  outPath,
  ['word\tbook_count\tbasis', ...sample.map((r) => `${r.word}\t${r.count}\t${r.basis}`)].join('\n') + '\n',
  'utf-8',
);

console.log('정본 입력      : ' + path.relative(ROOT, srcPath).split(path.sep).join('/'));
console.log('생성 시각(원본): ' + data.generated_at);
console.log('고유 단어 총수 : ' + words.length + ' (선언값 ' + w0.unique_word_count + ')');
console.log('빈도 상위 ' + TOP_N + '   : ' + top[0] + '(' + counts[top[0]] + ') … ' + top[TOP_N - 1] + '(' + counts[top[TOP_N - 1]] + ')');
console.log('  50/51위 동점: ' + (cutTie ? '있음 — 동점은 단어 오름차순으로 끊음' : '없음'));
console.log('무작위 ' + RANDOM_N + ' (seed=' + SEED + ') : 모집단 ' + rest.length + '개 중');
console.log('표본 합계      : ' + sample.length + '개');
console.log('산출           : ' + path.relative(ROOT, outPath).split(path.sep).join('/'));
