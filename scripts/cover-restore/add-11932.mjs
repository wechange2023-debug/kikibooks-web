/**
 * 팀장 지시(2026-07-30): 부분결손 N=11932(Ekai's First Day In School)를 target-list.json에 추가.
 * 1번 이미지(pages/11853.png)는 404이므로 제외하고, 2번 이미지(pages/10611.png)부터 승격 대상으로 넣는다.
 * 결과: total 744 → 745.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'target-list.json');
const BOOK_ID = '03adf038-039b-4b8d-9c67-79b271d200aa';

const t = JSON.parse(readFileSync(OUT, 'utf8'));
if (t.books.some((b) => b.book_id === BOOK_ID)) {
  console.log('[SKIP] 이미 추가돼 있음');
  process.exit(0);
}

// probe-11932.mjs 실측(2026-07-30): 매니페스트 200 · 12장 중 1번만 404, 2~12번 200
const deadFirst = 'https://africanstorybook.org/illustrations/pages/11853.png';
const images = [
  'https://africanstorybook.org/illustrations/pages/10611.png',
  'https://africanstorybook.org/illustrations/pages/10778.png',
  'https://africanstorybook.org/illustrations/pages/9715.png',
  'https://africanstorybook.org/illustrations/pages/11676.png',
  'https://africanstorybook.org/illustrations/pages/10611.png',
  'https://africanstorybook.org/illustrations/pages/10803.png',
  'https://africanstorybook.org/illustrations/pages/9582.png',
  'https://africanstorybook.org/illustrations/pages/9372.png',
  'https://africanstorybook.org/illustrations/pages/9690.png',
  'https://africanstorybook.org/illustrations/pages/11657.png',
  'https://africanstorybook.org/illustrations/pages/7925.png',
];

t.books.push({
  book_id: BOOK_ID,
  title: "Ekai's First Day In School",
  coverN: 11932,
  origin: 'partial_loss_included',
  manifest_url: 'https://raw.githubusercontent.com/global-asp/asp-raw-db/master/data/11932.txt',
  image_count: images.length,
  first_image_url: images[0],
  images,
  note: `1번 이미지 ${deadFirst} 404 — 팀장 지시로 2번 이미지부터 승격 (2026-07-30)`,
});
t.total = t.books.length;
t.excluded = t.excluded.map((e) =>
  e.book_id === BOOK_ID ? { ...e, reason: '부분결손 — 팀장 지시로 2번 이미지 승격, books에 재포함 (2026-07-30)' } : e,
);
writeFileSync(OUT, JSON.stringify(t, null, 1), 'utf8');
console.log(`[OK] N=11932 추가 → total ${t.total}권`);
