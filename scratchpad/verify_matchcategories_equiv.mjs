// P0-3(B) 게이트 검증: matchCategories 개선 전(OLD)/후(NEW) 출력 완전 동일 대조.
// - OLD: 책당 kw.toLowerCase() 반복 (기존 구현)
// - NEW: 모듈 로드 시 1회 소문자화한 키워드 사용 (개선 구현)
// 카운트는 책별 matchCategories 결과의 합이므로, 모든 title에 대해 matched 배열이
// 동일하면 카테고리별 count도 동일하다. 여기서는 (1) 실제 CATEGORIES 키워드 + 대표 title,
// (2) 임의 키워드/타이틀 퍼징으로 데이터 독립적 동치성을 empirically 확인한다.

// 실제 categories.ts의 CATEGORIES 키워드를 그대로 옮긴다(2026-07-01 e67331c 기준).
const CATEGORIES = [
  { slug: 'animals', keywords: ['animal','dog','cat','lion','tiger','bear','monkey','elephant','rabbit','bird','fish','horse','pig','fox','duck'] },
  { slug: 'family', keywords: ['family','mom','dad','mother','father','baby','brother','sister','grandma','grandpa','parent','home'] },
  { slug: 'abc', keywords: ['abc','alphabet','letter','letters','a is for','b is for','my first','learn letters','phonics','first words'] },
  { slug: 'numbers', keywords: ['number','numbers','count','counting','one two','ten','hundred','zero','math','how many','first numbers','1 2 3'] },
  { slug: 'emotions', keywords: ['feel','feeling','feelings','emotion','happy','sad','angry','scared','brave','kind','friend','friendship','share','smile','fear'] },
  { slug: 'nature', keywords: ['tree','flower','garden','forest','mountain','river','ocean','sea','sun','moon','star','rain','snow','season','spring','summer','winter','leaf'] },
  { slug: 'food', keywords: ['food','eat','fruit','vegetable','apple','banana','bread','soup','cake','cook','kitchen','hungry','meal','lunch'] },
  { slug: 'bedtime', keywords: ['night','sleep','bedtime','dream','good night','lullaby','tired','blanket','bed','pajama','goodnight','nap'] },
];

// OLD 구현 — 책당 kw.toLowerCase() 반복
function matchOld(title, cats) {
  const lowerTitle = title.toLowerCase();
  const matched = [];
  for (const cat of cats) {
    if (cat.keywords.some((kw) => lowerTitle.includes(kw.toLowerCase()))) matched.push(cat.slug);
  }
  return matched;
}

// NEW 구현 — 사전 소문자화 키워드 사용 (모듈 로드 1회)
function buildLower(cats) {
  return cats.map((c) => ({ slug: c.slug, keywords: c.keywords.map((kw) => kw.toLowerCase()) }));
}
function matchNew(title, catsLower) {
  const lowerTitle = title.toLowerCase();
  const matched = [];
  for (const cat of catsLower) {
    if (cat.keywords.some((kw) => lowerTitle.includes(kw))) matched.push(cat.slug);
  }
  return matched;
}

function eq(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }

let checked = 0, mismatches = 0;
function assertSame(title, cats, catsLower) {
  const o = matchOld(title, cats), n = matchNew(title, catsLower);
  checked++;
  if (!eq(o, n)) { mismatches++; console.log('MISMATCH title=%j old=%j new=%j', title, o, n); }
}

// (1) 실제 CATEGORIES 기준 대표 title 세트
{
  const catsLower = buildLower(CATEGORIES);
  const titles = [];
  for (const cat of CATEGORIES) for (const kw of cat.keywords) {
    titles.push(kw, kw.toUpperCase(), kw[0].toUpperCase() + kw.slice(1),
      `The ${kw} Book`, `A story about ${kw}s`, `${kw.toUpperCase()} and more`, `xx${kw}xx`);
  }
  titles.push('', '   ', 'No keyword here at all', 'Happy Little Dog at Night',
    'Counting Sheep before Bed', 'Mother and Baby Bird', 'ABC 1 2 3', 'good night moon');
  for (const t of titles) assertSame(t, CATEGORIES, catsLower);
}

// (2) 데이터 독립 퍼징 — 임의 키워드(대소문자 혼합 포함)와 임의 title
{
  const alpha = 'abcDEFghiJKL 123';
  const rnd = (seed) => { // 결정적 LCG (Math.random 미사용, 재현 가능)
    let s = seed >>> 0;
    return () => { s = (1103515245 * s + 12345) >>> 0; return s / 4294967296; };
  };
  const r = rnd(42);
  const randStr = (len) => Array.from({ length: len }, () => alpha[Math.floor(r() * alpha.length)]).join('');
  for (let i = 0; i < 5000; i++) {
    const cats = [{ slug: 'x', keywords: Array.from({ length: 1 + Math.floor(r() * 5) }, () => randStr(1 + Math.floor(r() * 4))) }];
    const catsLower = buildLower(cats);
    assertSame(randStr(Math.floor(r() * 12)), cats, catsLower);
  }
}

console.log('checked=%d mismatches=%d => %s', checked, mismatches, mismatches === 0 ? 'IDENTICAL (gate PASS)' : 'DIFFERENT (gate FAIL)');
process.exit(mismatches === 0 ? 0 : 1);
