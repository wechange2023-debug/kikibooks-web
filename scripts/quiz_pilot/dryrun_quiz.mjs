/**
 * 책 퀴즈 문항 빌더 전수 드라이런 (ADR-0065 Amd#2 D-B3 검증 · 읽기 전용).
 *
 * `lib/quiz/*.ts`를 **실물 그대로** 불러 858권 전량에 문항 조건을 적용하고,
 * 문항별 출제 가능 권수가 확정치(856 / 858 / **706**)와 **일치하는지 대조**한다.
 * 불일치는 STOP 사유다 — 화면을 만들기 전에 잡아야 한다.
 *
 * ★ DB는 SELECT만. 쓰기 0건(ADR-0065 D1).
 *
 * 실행:
 *   node --conditions=react-server --env-file=.env.local \
 *        --import ./scripts/wordplay/register-hooks.mjs scripts/quiz_pilot/dryrun_quiz.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import { eligibleQuestionIds, buildQuiz } from '../../lib/quiz/build-quiz.ts';
import { isTextPrintedOnImages } from '../../lib/quiz/text-printed.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PAGE_SIZE = 1000;
const READER_VOICE = 'danielle';

/**
 * 대조 기준값.
 *   q1·q2 — Q-0 실측 §4 그대로.
 *   q3    — **706**. Q-0의 707은 텍스트 *면 수* 기준 근사치였고,
 *           고유 문장 수 기준으로 다시 세어 706으로 확정했다
 *           (팀장 A안 확정 2026-08-21 · ADR Amd#2 D-B3).
 *   q3NoExclusion — 문장 인쇄 계보를 빼지 않았을 때의 ③ 권수(리포트 각주 857 검증용).
 */
const EXPECTED = { q1: 856, q2: 858, q3: 706, q3NoExclusion: 857, population: 858 };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
);

async function pageAll(table, cols, apply) {
  const out = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    let q = supabase.from(table).select(cols);
    if (apply) q = apply(q);
    const { data, error } = await q
      .order(table === 'books' ? 'id' : 'book_id')
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) return out;
  }
}

console.log('[1/3] books …');
const books = await pageAll('books', 'id, source_id, source_platform, is_active');
console.log('[2/3] book_text …');
const textRows = await pageAll('book_text', 'book_id, page_index, text, image_url');
console.log('[3/3] book_audio …');
const audioRows = await pageAll('book_audio', 'book_id, kind, page_index, voice');

const active = new Map(books.filter((b) => b.is_active).map((b) => [b.id, b]));

const textByBook = new Map();
for (const r of textRows) {
  if (!active.has(r.book_id)) continue;
  if (!textByBook.has(r.book_id)) textByBook.set(r.book_id, []);
  textByBook.get(r.book_id).push(r);
}

const audioPages = new Map();
for (const r of audioRows) {
  if (r.voice !== READER_VOICE || r.kind !== 'page') continue;
  if (!audioPages.has(r.book_id)) audioPages.set(r.book_id, new Set());
  audioPages.get(r.book_id).add(r.page_index);
}

/** 모집단 = 활성 ∩ book_text 보유 ∩ 페이지 오디오 보유 (Q-0 §1과 같은 정의). */
const population = [...active.values()].filter(
  (b) => (textByBook.get(b.id)?.length ?? 0) > 0 && (audioPages.get(b.id)?.size ?? 0) > 0,
);

/** 실 서비스의 getQuizSource와 같은 모양으로 재료를 만든다(오디오 URL은 존재 여부만 중요). */
function makeSource(book) {
  const rows = (textByBook.get(book.id) ?? []).slice().sort((a, b) => a.page_index - b.page_index);
  const withAudio = audioPages.get(book.id) ?? new Set();
  return {
    bookId: book.id,
    pages: rows.map((r) => ({
      pageIndex: r.page_index,
      imageUrl: r.image_url,
      text: (r.text ?? '').trim(),
      audioUrl: withAudio.has(r.page_index) ? `https://example.invalid/p${r.page_index}.mp3` : null,
    })),
    prompts: [
      { id: 'q1', text: 'q1', audioUrl: 'https://example.invalid/_quiz/seoyeon/q1.mp3' },
      { id: 'q2', text: 'q2', audioUrl: 'https://example.invalid/_quiz/seoyeon/q2.mp3' },
      { id: 'q3', text: 'q3', audioUrl: 'https://example.invalid/_quiz/seoyeon/q3.mp3' },
    ],
    textPrintedOnImages: isTextPrintedOnImages(book),
  };
}

const counts = { q1: 0, q2: 0, q3: 0 };
/** 인쇄 계보를 빼지 않았다면 ③이 몇 권이 되는가 — 리포트 각주(857) 검증용. */
let q3NoExclusion = 0;
const bySource = {};
const noQuestion = [];
const buildMismatch = [];
let printedLineage = 0;

for (const book of population) {
  const source = makeSource(book);
  if (source.textPrintedOnImages) printedLineage += 1;

  const eligible = eligibleQuestionIds(source);
  for (const id of eligible) counts[id] += 1;

  // 같은 재료에서 계보 제외만 끈다(다른 조건은 그대로).
  if (eligibleQuestionIds({ ...source, textPrintedOnImages: false }).includes('q3')) {
    q3NoExclusion += 1;
  }

  bySource[book.source_platform] ??= { q1: 0, q2: 0, q3: 0, books: 0 };
  bySource[book.source_platform].books += 1;
  for (const id of eligible) bySource[book.source_platform][id] += 1;

  if (eligible.length === 0) noQuestion.push(book.source_id);

  // 조립이 실제로 되는지 — 자격만 있고 만들지 못하면 화면이 빈다.
  const built = buildQuiz(source).map((q) => q.id);
  if (JSON.stringify(built) !== JSON.stringify(eligible)) {
    buildMismatch.push({ slug: book.source_id, eligible, built });
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n모집단 ${population.length}권 (기대 ${EXPECTED.population})`);
console.log(`문장 인쇄 계보 ${printedLineage}권 (기대 151)\n`);
console.log(`${pad('문항', 6)}${pad('실측', 8)}${pad('Q-0 기대', 10)}판정`);
for (const id of ['q1', 'q2', 'q3']) {
  const ok = counts[id] === EXPECTED[id];
  console.log(`${pad(id, 6)}${pad(counts[id], 8)}${pad(EXPECTED[id], 10)}${ok ? 'OK 일치' : 'MISMATCH 불일치'}`);
}

console.log(
  `${pad('q3(계보 미제외)', 6)}${pad(q3NoExclusion, 8)}${pad(EXPECTED.q3NoExclusion, 10)}` +
    `${q3NoExclusion === EXPECTED.q3NoExclusion ? 'OK 일치' : 'MISMATCH 불일치'}`,
);

console.log('\n소스별:');
for (const [src, c] of Object.entries(bySource)) {
  console.log(`  ${pad(src, 20)} 책 ${pad(c.books, 5)} q1 ${pad(c.q1, 5)} q2 ${pad(c.q2, 5)} q3 ${c.q3}`);
}

console.log(`\n출제 가능 문항 0개인 책: ${noQuestion.length}권`);
console.log(`자격/조립 불일치: ${buildMismatch.length}건`);
if (buildMismatch.length) console.log('  ', buildMismatch.slice(0, 5));

const outDir = join(SCRIPT_DIR, 'out');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, '_quiz_dryrun.json'),
  JSON.stringify(
    { population: population.length, printedLineage, counts, q3NoExclusion, expected: EXPECTED, bySource, noQuestion, buildMismatch },
    null,
    1,
  ),
  'utf-8',
);

const allMatch =
  population.length === EXPECTED.population &&
  ['q1', 'q2', 'q3'].every((id) => counts[id] === EXPECTED[id]) &&
  q3NoExclusion === EXPECTED.q3NoExclusion &&
  buildMismatch.length === 0;
console.log(`\n[${allMatch ? 'PASS' : 'STOP'}] ${join(outDir, '_quiz_dryrun.json')}`);
process.exit(allMatch ? 0 : 1);
