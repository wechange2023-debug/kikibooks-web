/**
 * 회전 간 고유 단어 차이 + 새 단어의 문맥 출력 (지시서 E-2c-4 수렴 반복용).
 *
 * 드라이런은 날짜로 파일명을 만들어 **같은 파일을 덮어쓴다**. 회전마다 스냅숏을
 * out/rounds/roundN.json 으로 떠 두고 이 스크립트로 직전 회전과 비교한다.
 *
 * 실행: node scripts/wordcard_pilot/diff_round.mjs <이전.json> <이후.json>
 */
import fs from 'node:fs';

const [prevPath, nextPath] = process.argv.slice(2);
const prev = JSON.parse(fs.readFileSync(prevPath, 'utf-8'));
const next = JSON.parse(fs.readFileSync(nextPath, 'utf-8'));

const p = new Set(prev.w0.unique_words);
const n = new Set(next.w0.unique_words);
const added = [...n].filter((w) => !p.has(w)).sort();
const removed = [...p].filter((w) => !n.has(w)).sort();

const idx = new Map();
for (const b of next.books) for (const w of b.cards ?? []) if (!idx.has(w)) idx.set(w, b);

const prevRend = new Set(prev.books.filter((b) => b.rendered).map((b) => b.title));
const nextRend = new Set(next.books.filter((b) => b.rendered).map((b) => b.title));
const lostBooks = [...prevRend].filter((t) => !nextRend.has(t));

console.log(`고유 단어 ${p.size} → ${n.size}`);
console.log(`진입 권수 ${prevRend.size} → ${nextRend.size}` + (lostBooks.length ? `  진입 상실: ${lostBooks.join(', ')}` : ''));
console.log(`카드 ${prev.totals.cards} → ${next.totals.cards} · 재생불가 ${prev.totals.unplayable} → ${next.totals.unplayable}`);
console.log(`빠진 단어 ${removed.length} · 새로 올라온 단어 ${added.length}`);
console.log('');
for (const w of added) {
  const b = idx.get(w);
  console.log(`${w.padEnd(13)} (${next.w0.word_book_counts[w]}) ${(b?.title ?? '').slice(0, 38).padEnd(38)} | ${(b?.cards ?? []).join(', ')}`);
}
