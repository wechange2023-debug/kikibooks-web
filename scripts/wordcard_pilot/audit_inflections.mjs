/**
 * 원형/활용형 쌍 표기 일관성 감사 (지시서 E-2c-9 STEP 1).
 *
 * 두 가지를 **기계적으로** 한다. 손으로 고른 목록이 아니다.
 *   ① 사전 안에서 원형·활용형이 함께 등재된 묶음을 철자 규칙으로 추출
 *   ② 각 뜻의 **한글 어미**를 종성(받침)으로 분류해 실제 관례를 실측
 *
 * 어미 분류 — 한글 음절 분해로 판정한다(문자열 매칭이 아니라 자모 판정).
 *   '다'로 끝나고 직전 음절 종성이 ㅆ  → 과거   (했다·왔다·갔다·썼다 …)
 *   '다'로 끝나고 직전 음절 종성이 ㄴ  → 현재3인칭(한다·는다·온다·준다 …)
 *   '다'로 끝나는 그 밖              → 원형   (하다·먹다·만들다 …)
 *   '는'·'은'·'ㄴ' 관형형으로 끝남      → 분사   (하는·먹는·밝은 …)
 *   그 밖                          → 명사·기타
 *
 * ★ DB·Storage 접근 0건.
 *
 * 실행: node --conditions=react-server --import ./scripts/wordplay/register-hooks.mjs \
 *            scripts/wordcard_pilot/audit_inflections.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

const { KO_MEANINGS } = await import('@/lib/wordplay/ko-meanings');
const dict = KO_MEANINGS;
const has = (w) => Object.prototype.hasOwnProperty.call(dict, w);

// ── 한글 어미 분류 ──────────────────────────────────────────────────────────
const JONG = (ch) => {
  const c = ch.codePointAt(0);
  if (c < 0xac00 || c > 0xd7a3) return -1;
  return (c - 0xac00) % 28;
};
const JONG_SS = 20; // ㅆ
const JONG_N = 4;   // ㄴ

function endingClass(ko) {
  const s = ko.trim();
  const last = s[s.length - 1];
  const prev = s[s.length - 2];
  if (last === '다' && prev) {
    const j = JONG(prev);
    if (j === JONG_SS) return '과거';
    if (j === JONG_N) return '현재3인칭';
    return '원형';
  }
  if (last === '는') return '분사';
  if (last && JONG(last) === JONG_N && last !== '는') return '관형';  // 밝은·작은·큰
  return '명사기타';
}

// ── 활용형 → 원형 후보 (철자 규칙) ──────────────────────────────────────────
function basesOf(w) {
  const out = new Set();
  const add = (x) => { if (x && x.length >= 2 && x !== w) out.add(x); };
  if (w.endsWith('ies')) { add(w.slice(0, -3) + 'y'); add(w.slice(0, -2)); }
  if (w.endsWith('es')) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
  if (w.endsWith('ied')) { add(w.slice(0, -3) + 'y'); }
  if (w.endsWith('ed')) {
    add(w.slice(0, -2)); add(w.slice(0, -1));
    if (/(.)\1ed$/.test(w)) add(w.slice(0, -3));           // stopped → stop
  }
  if (w.endsWith('ing')) {
    add(w.slice(0, -3)); add(w.slice(0, -3) + 'e');
    if (/(.)\1ing$/.test(w)) add(w.slice(0, -4));          // running → run
  }
  return [...out];
}

/** 불규칙 — 사전 안에 실제로 둘 다 있는 것만 잡히도록 쌍으로 적는다. */
const IRREGULAR = [
  ['go', 'went'], ['go', 'goes'], ['goes', 'going'], ['make', 'made'], ['take', 'took'],
  ['come', 'came'], ['see', 'saw'], ['say', 'said'], ['tell', 'told'], ['bring', 'brought'],
  ['buy', 'bought'], ['catch', 'caught'], ['teach', 'taught'], ['think', 'thought'],
  ['find', 'found'], ['give', 'gave'], ['grow', 'grew'], ['know', 'knew'], ['draw', 'drew'],
  ['fly', 'flew'], ['run', 'ran'], ['sing', 'sang'], ['swim', 'swam'], ['begin', 'began'],
  ['break', 'broke'], ['wake', 'woke'], ['sleep', 'slept'], ['feel', 'felt'], ['fall', 'fell'],
  ['leave', 'left'], ['lose', 'lost'], ['win', 'won'], ['sell', 'sold'], ['eat', 'ate'],
  ['become', 'became'], ['build', 'built'], ['hear', 'heard'], ['read', 'read'],
  ['stand', 'stood'], ['sit', 'sat'], ['send', 'sent'], ['spend', 'spent'], ['sweep', 'swept'],
  ['is', 'was'], ['learn', 'learnt'], ['throw', 'threw'],
];

// ── 묶음 만들기 ─────────────────────────────────────────────────────────────
const parent = new Map();
const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
const union = (a, b) => { parent.set(find(a), find(b)); };
for (const w of Object.keys(dict)) parent.set(w, w);

const link = [];
for (const w of Object.keys(dict)) {
  for (const b of basesOf(w)) if (has(b)) { union(w, b); link.push([b, w]); }
}
for (const [a, b] of IRREGULAR) if (has(a) && has(b)) { union(a, b); link.push([a, b]); }

const groups = new Map();
for (const w of Object.keys(dict)) {
  const r = find(w);
  if (!groups.has(r)) groups.set(r, []);
  groups.get(r).push(w);
}
const fams = [...groups.values()].filter((g) => g.length > 1)
  .map((g) => g.sort((a, b) => a.length - b.length || (a < b ? -1 : 1)))
  .sort((a, b) => (a[0] < b[0] ? -1 : 1));

// ── 어미 분류 실측 ──────────────────────────────────────────────────────────
const bucket = {};
for (const [w, ko] of Object.entries(dict)) (bucket[endingClass(ko)] ??= []).push(w);

console.log('=== 전체 사전 어미 분류 (실측) ===');
for (const [k, v] of Object.entries(bucket).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${k.padEnd(8)} ${String(v.length).padStart(4)}개  예: ${v.slice(0, 5).map((w) => `${w}=${dict[w]}`).join(', ')}`);
}

// 활용형 종류별로 어미가 어떻게 쓰이는지
const KIND = (w, base) => {
  if (IRREGULAR.some(([a, b]) => (a === base && b === w))) return '불규칙과거';
  if (w === base + 'ing' || w === base.replace(/e$/, '') + 'ing' || /(.)\1ing$/.test(w)) return '-ing';
  if (w.endsWith('ed') || w.endsWith('ied')) return '-ed';
  if (w.endsWith('es') || w.endsWith('s')) return '-s/-es';
  return '기타';
};
const byKind = {};
for (const [b, w] of link) {
  const k = KIND(w, b);
  (byKind[k] ??= {});
  const e = endingClass(dict[w]);
  (byKind[k][e] ??= []).push(`${w}=${dict[w]}`);
}
console.log('\n=== 활용형 종류별 한글 어미 분포 (지배적 관례 판정용) ===');
for (const [kind, dist] of Object.entries(byKind)) {
  const tot = Object.values(dist).reduce((a, v) => a + v.length, 0);
  const sorted = Object.entries(dist).sort((a, b) => b[1].length - a[1].length);
  console.log(`\n  [${kind}] 총 ${tot}개`);
  for (const [e, ws] of sorted) {
    const pct = ((ws.length / tot) * 100).toFixed(0);
    console.log(`     ${e.padEnd(8)} ${String(ws.length).padStart(3)}개 (${pct}%)  ${ws.slice(0, 6).join(', ')}${ws.length > 6 ? ' …' : ''}`);
  }
}

// ── 명사 단복수 쌍 별도 집계 ────────────────────────────────────────────────
const nounPairs = [];
for (const [b, w] of link) {
  if (!(w.endsWith('s') || w.endsWith('es'))) continue;
  if (endingClass(dict[b]) !== '명사기타') continue;
  nounPairs.push([b, w, dict[b], dict[w], dict[w] === dict[b] + '들' ? 'OK(들)' : dict[w] === dict[b] ? '동일' : '기타']);
}
const nounStat = {};
for (const p of nounPairs) nounStat[p[4]] = (nounStat[p[4]] ?? 0) + 1;
console.log(`\n=== 명사 단복수 쌍 ${nounPairs.length}개 ===`);
console.log('  ' + JSON.stringify(nounStat));
const odd = nounPairs.filter((p) => p[4] === '기타');
console.log(`  '들' 규칙을 안 따르는 쌍 ${odd.length}개:`);
for (const p of odd) console.log(`     ${p[0]}=${p[2]}  /  ${p[1]}=${p[3]}`);

// ── 활용형 쌍 중 관례 이탈 ──────────────────────────────────────────────────
const EXPECT = { '-s/-es': '현재3인칭', '-ed': '과거', '불규칙과거': '과거', '-ing': '분사' };
const deviations = [];
for (const [b, w] of link) {
  const kind = KIND(w, b);
  const want = EXPECT[kind];
  if (!want) continue;
  if (endingClass(dict[b]) === '명사기타') continue;   // 명사 단복수는 위에서 따로 봤다
  const got = endingClass(dict[w]);
  if (got !== want) deviations.push({ base: b, word: w, koBase: dict[b], ko: dict[w], kind, want, got });
}
console.log(`\n=== 관례 이탈 ${deviations.length}건 ===`);
for (const d of deviations) {
  console.log(`  ${d.word.padEnd(12)} ${d.ko.padEnd(10)} [${d.got}]  기대 ${d.want}  (원형 ${d.base}=${d.koBase}, ${d.kind})`);
}

console.log(`\n[요약] 활용 묶음 ${fams.length}개 · 연결 쌍 ${link.length}개 · 명사 단복수 ${nounPairs.length}쌍 · 이탈 ${deviations.length + odd.length}건`);
fs.writeFileSync(path.join(HERE, 'out', 'inflection_audit.json'),
  JSON.stringify({ families: fams, deviations, nounOdd: odd }, null, 1), 'utf-8');
