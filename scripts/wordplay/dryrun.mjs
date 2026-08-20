/**
 * 단어카드 로직 전수 드라이런 (ADR-0065 E-2a 검증 · 읽기 전용).
 *
 * lib/wordplay/*.ts를 **실물 그대로** 불러 858권(book_text 보유 활성 도서) 전량에 대해
 * 단어 선정과 발음 구간 산출을 돌리고, 다음을 실측한다:
 *   a. 카드 MIN_CARDS 미만(진입점 미렌더) 도서 수 — ADR-0065 §검증 계획 V4
 *   b. 단어-마크 매칭 실패율 (전체 선정 단어 중 재생 불가 비율)
 *   c. 소스(source_platform)별 분포
 *   d. 예상 외 텍스트 패턴(HTML 엔티티 등) 건수 — 백로그 근거용. **보정하지 않는다.**
 *
 * ★ DB는 SELECT만. 어떤 쓰기도 하지 않는다(ADR-0065 D1 무기록 원칙).
 * ★ 결과 JSON은 scripts/wordplay/out/ 아래에 저장한다 — .gitignore의 `out/` 규칙 대상이라
 *   커밋되지 않는다(작업지시서 E-2a §6).
 *
 * 실행:
 *   node --conditions=react-server --env-file=.env.local \
 *        --import ./scripts/wordplay/register-hooks.mjs scripts/wordplay/dryrun.mjs
 *
 * 옵션:
 *   --limit=N        책 N권만 (표본 확인용)
 *   --platform=X     특정 source_platform만
 *   --sample=N       플랫폼별 N권의 선정 단어 목록을 상세 출력 (육안 판단 재료)
 *   --no-audio       발음 구간 산출을 건너뛴다(단어 선정만 빠르게 확인)
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import { selectWordCards, MIN_CARDS } from '../../lib/wordplay/select-words.ts';
import { resolveWordAudioClips } from '../../lib/wordplay/word-audio.ts';
import { STOPWORD_COUNT } from '../../lib/wordplay/stopwords.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

/** marks fetch 동시 실행 상한 — 책 단위 병렬도. */
const CONCURRENCY = 6;
/** PostgREST 기본 max-rows. 전량 조회는 반드시 range 루프로 한다. */
const PAGE_SIZE = 1000;

/** 예상 외 텍스트 패턴 — 발견만 하고 **보정하지 않는다**(작업지시서 §7). */
const ODD_PATTERNS = [
  { key: 'html_entity', re: /&(?:[a-zA-Z][a-zA-Z0-9]{1,10}|#\d{1,6}|#x[0-9a-fA-F]{1,6});/g },
  { key: 'html_tag', re: /<\/?[a-zA-Z][^>]{0,60}>/g },
  { key: 'backslash_escape', re: /\\[nrt"']/g },
  { key: 'double_space', re: / {2,}/g },
  { key: 'url', re: /https?:\/\/\S+/g },
  { key: 'digit_run', re: /\d{2,}/g },
  { key: 'replacement_char', re: /�/g },
];

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 없음. --env-file=.env.local 로 실행하세요.`);
  return v;
}

const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SECRET_KEY'),
  { auth: { persistSession: false } },
);

/** range 루프로 전량 조회 (1000행 cap 회피 — lib/book/audio-manifest.ts의 교훈). */
async function selectAll(table, columns, apply) {
  const out = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = supabase.from(table).select(columns).order('id', { ascending: true });
    if (apply) q = apply(q);
    const { data, error } = await q.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table} 조회 실패 — ${error.message}`);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}

async function main() {
  const platform = arg('platform');
  const limit = Number(arg('limit', '0')) || 0;
  const sampleN = Number(arg('sample', '0')) || 0;
  const skipAudio = hasFlag('no-audio');

  console.log(`불용어 ${STOPWORD_COUNT}개 · MIN_CARDS=${MIN_CARDS}`);
  console.log('대상 도서 조회 중...');

  // book_text를 보유한 활성 도서만 (GDL은 자연히 0권 — ADR-0065 D2).
  const books = await selectAll('books', 'id, title, source_platform', (q) => {
    const base = q.eq('is_active', true);
    return platform ? base.eq('source_platform', platform) : base;
  });

  const textBookIds = new Set(
    (await selectAll('book_text', 'id, book_id')).map((r) => r.book_id),
  );

  let targets = books.filter((b) => textBookIds.has(b.id));
  if (limit) targets = targets.slice(0, limit);
  console.log(`활성 ${books.length}권 중 book_text 보유 ${targets.length}권 처리\n`);

  const results = [];
  const oddCounts = Object.fromEntries(ODD_PATTERNS.map((p) => [p.key, 0]));
  const oddSamples = Object.fromEntries(ODD_PATTERNS.map((p) => [p.key, []]));
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= targets.length) return;
      const book = targets[i];

      // 예상 외 패턴 스캔 — 원문 그대로 본다(보정 0건).
      const { data: rawRows } = await supabase
        .from('book_text')
        .select('text')
        .eq('book_id', book.id);
      for (const row of rawRows ?? []) {
        const t = row.text ?? '';
        for (const p of ODD_PATTERNS) {
          const found = t.match(p.re);
          if (found) {
            oddCounts[p.key] += found.length;
            if (oddSamples[p.key].length < 5) {
              oddSamples[p.key].push({
                bookId: book.id,
                title: book.title,
                sample: found.slice(0, 3),
              });
            }
          }
        }
      }

      const selection = await selectWordCards(supabase, book.id);
      const entry = {
        bookId: book.id,
        title: book.title,
        platform: book.source_platform,
        rendered: selection !== null,
        totalPages: selection?.totalPages ?? null,
        eligibleWordCount: selection?.eligibleWordCount ?? null,
        cards: selection?.candidates.map((c) => c.word) ?? [],
        capitalizedCards: selection?.candidates.filter((c) => c.alwaysCapitalized).map((c) => c.word) ?? [],
        clips: null,
      };

      if (selection && !skipAudio) {
        const clips = await resolveWordAudioClips(supabase, book.id, selection.candidates);
        entry.clips = clips.map((c) => ({
          word: c.word,
          playable: c.playable,
          failure: c.failure,
          durationMs: c.playable ? c.endMs - c.startMs : null,
        }));
      }

      results.push(entry);
      done++;
      if (done % 50 === 0) console.log(`  ... ${done}/${targets.length}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // ---- 집계 ----
  const byPlatform = {};
  for (const r of results) {
    const p = (byPlatform[r.platform] ??= {
      books: 0, rendered: 0, notRendered: 0,
      cards: 0, playable: 0, unplayable: 0,
      failures: {}, capitalizedCards: 0,
    });
    p.books++;
    if (!r.rendered) { p.notRendered++; continue; }
    p.rendered++;
    p.cards += r.cards.length;
    p.capitalizedCards += r.capitalizedCards.length;
    for (const c of r.clips ?? []) {
      if (c.playable) p.playable++;
      else {
        p.unplayable++;
        p.failures[c.failure] = (p.failures[c.failure] ?? 0) + 1;
      }
    }
  }

  const pad = (s, n) => String(s).padEnd(n);
  const num = (s, n) => String(s).padStart(n);
  console.log(`\n${pad('플랫폼', 20)}${num('대상', 6)}${num('진입점', 8)}${num('미렌더', 8)}${num('카드', 7)}${num('재생가능', 10)}${num('실패', 7)}${num('실패율', 9)}`);
  console.log('-'.repeat(75));
  const tot = { books: 0, rendered: 0, notRendered: 0, cards: 0, playable: 0, unplayable: 0 };
  for (const [name, p] of Object.entries(byPlatform).sort()) {
    const rate = p.cards ? ((p.unplayable / p.cards) * 100).toFixed(1) + '%' : '—';
    console.log(pad(name, 20) + num(p.books, 6) + num(p.rendered, 8) + num(p.notRendered, 8) + num(p.cards, 7) + num(p.playable, 10) + num(p.unplayable, 7) + num(rate, 9));
    for (const k of ['books', 'rendered', 'notRendered', 'cards', 'playable', 'unplayable']) tot[k] += p[k];
  }
  console.log('-'.repeat(75));
  const totRate = tot.cards ? ((tot.unplayable / tot.cards) * 100).toFixed(1) + '%' : '—';
  console.log(pad('합계', 20) + num(tot.books, 6) + num(tot.rendered, 8) + num(tot.notRendered, 8) + num(tot.cards, 7) + num(tot.playable, 10) + num(tot.unplayable, 7) + num(totRate, 9));

  const allFailures = {};
  for (const p of Object.values(byPlatform))
    for (const [k, v] of Object.entries(p.failures)) allFailures[k] = (allFailures[k] ?? 0) + v;
  console.log('\n재생 불가 사유별:', JSON.stringify(allFailures));

  const capTotal = Object.values(byPlatform).reduce((a, p) => a + p.capitalizedCards, 0);
  console.log(`항상 대문자로 시작한 카드(고유명사 추정): ${capTotal} / ${tot.cards} (${tot.cards ? (capTotal / tot.cards * 100).toFixed(1) : 0}%)`);

  console.log('\n예상 외 텍스트 패턴(보정 0건, 발견 건수):');
  for (const [k, v] of Object.entries(oddCounts)) if (v > 0) console.log(`  ${pad(k, 20)} ${v}건`);
  if (Object.values(oddCounts).every((v) => v === 0)) console.log('  (없음)');

  // ---- 표본 상세 ----
  if (sampleN) {
    console.log(`\n=== 플랫폼별 표본 ${sampleN}권 선정 단어 ===`);
    for (const name of Object.keys(byPlatform).sort()) {
      console.log(`\n[${name}]`);
      for (const r of results.filter((x) => x.platform === name && x.rendered).slice(0, sampleN)) {
        const playMap = new Map((r.clips ?? []).map((c) => [c.word, c.playable]));
        const words = r.cards.map((w) => (playMap.get(w) === false ? `${w}✗` : w)).join(', ');
        console.log(`  ${r.title}`);
        console.log(`    ${words}`);
      }
    }
    console.log('\n  (✗ = 발음 재생 불가)');
  }

  const outPath = join(SCRIPT_DIR, 'out', `wordplay-dryrun-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    stopword_count: STOPWORD_COUNT,
    min_cards: MIN_CARDS,
    totals: tot,
    by_platform: byPlatform,
    failures: allFailures,
    odd_patterns: { counts: oddCounts, samples: oddSamples },
    books: results,
  }, null, 2), 'utf8');
  console.log(`\n저장: ${outPath}`);
}

await main();
