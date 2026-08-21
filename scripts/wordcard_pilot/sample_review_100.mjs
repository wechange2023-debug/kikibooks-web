/**
 * 팀장 육안 검수용 무작위 표본 100개 추출 (지시서 E-2c-8 STEP 3).
 *
 * - 모집단: 사전 1,741개에서 **E-2c-1 표본 150개를 뺀 나머지**(이미 검수된 것을 다시
 *   보여줄 이유가 없다). 표본 150 중 제외 확정 11종은 애초에 사전에 없다.
 * - seed=43 고정 mulberry32 + Fisher-Yates → 언제 돌려도 같은 100개.
 *   (E-2c-1의 seed=42와 다른 값이라 두 표본이 같은 수열을 쓰지 않는다.)
 *
 * ★ DB·Storage 접근 0건.
 *
 * 실행: node --conditions=react-server --import ./scripts/wordplay/register-hooks.mjs \
 *            scripts/wordcard_pilot/sample_review_100.mjs
 * 출력: 화면 표 + scripts/wordcard_pilot/out/review_100_seed43.tsv
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SAMPLE150 = path.join(HERE, 'out', 'sample_150_ko.tsv');
const DRYRUN = path.join(ROOT, 'scripts', 'wordplay', 'out', 'wordplay-dryrun-20260821.json');
const OUT = path.join(HERE, 'out', 'review_100_seed43.tsv');

const SEED = 43;
const N = 100;

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

const { KO_MEANINGS } = await import('@/lib/wordplay/ko-meanings');
const counts = JSON.parse(fs.readFileSync(DRYRUN, 'utf-8')).w0.word_book_counts;
const already = new Set(
  fs.readFileSync(SAMPLE150, 'utf-8').replace(/\r\n/g, '\n').trim().split('\n').slice(1)
    .map((l) => l.split('\t')[0]),
);

const pool = Object.keys(KO_MEANINGS).filter((w) => !already.has(w)).sort();
const rnd = mulberry32(SEED);
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
const picked = pool.slice(0, N).sort();

const rows = picked.map((w) => [w, KO_MEANINGS[w], String(counts[w] ?? 0)]);
fs.writeFileSync(OUT, ['단어\t한글뜻\t실린책수', ...rows.map((r) => r.join('\t'))].join('\n') + '\n', 'utf-8');

console.log(`모집단 ${pool.length}개 (사전 ${Object.keys(KO_MEANINGS).length} − 기검수 표본 ${already.size} 중 잔존분)`);
console.log(`seed=${SEED} 무작위 ${picked.length}개 · 중복 ${new Set(picked).size === picked.length ? 0 : '있음'}`);
console.log(`겹침 확인: 표본150과 교집합 ${picked.filter((w) => already.has(w)).length}개\n`);

const col = (r) => `| ${r[0].padEnd(12)} | ${r[1].padEnd(9)} | ${r[2].padStart(3)} |`;
console.log('| 단어         | 한글뜻    | 책수 |');
console.log('|--------------|-----------|-----|');
for (const r of rows) console.log(col(r));
console.log(`\n산출: ${path.relative(ROOT, OUT).split(path.sep).join('/')}`);
