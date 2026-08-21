/**
 * 한글 뜻 사전 전수 검증 (지시서 E-2c-8 STEP 2).
 *
 * 대조 대상:
 *   lib/wordplay/ko-meanings.ts        ← 검증할 사전
 *   scripts/wordplay/out/wordplay-dryrun-20260821.json  ← 단어 목록 정본(w0.unique_words)
 *   scripts/wordcard_pilot/out/sample_150_ko.tsv        ← 표본 검수 통과분(승계 동일성)
 *
 * ★ DB·Storage·네트워크 접근 0건. 로컬 파일만 읽는다.
 *
 * 실행:
 *   node --conditions=react-server --import ./scripts/wordplay/register-hooks.mjs \
 *        scripts/wordcard_pilot/verify_ko_meanings.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DRYRUN = path.join(ROOT, 'scripts', 'wordplay', 'out', 'wordplay-dryrun-20260821.json');
const SAMPLE = path.join(HERE, 'out', 'sample_150_ko.tsv');

const MAX_LEN = 8;
/** 한글 음절 + 공백만 허용. 한자·로마자·괄호·물결표·숫자 전부 불가. */
const HANGUL_SPACE = /^[가-힣 ]+$/;

const { KO_MEANINGS, KO_MEANING_COUNT } = await import('@/lib/wordplay/ko-meanings');

const dryrun = JSON.parse(fs.readFileSync(DRYRUN, 'utf-8'));
const target = dryrun.w0.unique_words;
const entries = Object.entries(KO_MEANINGS);
const keys = Object.keys(KO_MEANINGS);

const fail = [];
const line = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' → ' + detail : ''}`);
  if (!ok) fail.push(label);
};

console.log('=== 필수 4항목 ===');

// ① 항목 수 = 목록과 정확히 일치 (누락 0 · 초과 0)
const missing = target.filter((w) => !(w in KO_MEANINGS));
const extra = keys.filter((w) => !target.includes(w));
line(`항목 수 ${KO_MEANING_COUNT} = 목록 ${target.length}`,
  KO_MEANING_COUNT === target.length && !missing.length && !extra.length,
  `누락 ${missing.length}${missing.length ? ' (' + missing.slice(0, 12).join(', ') + ')' : ''}` +
  ` · 초과 ${extra.length}${extra.length ? ' (' + extra.slice(0, 12).join(', ') + ')' : ''}`);

// ② 한글·공백 외 문자 0건
const badChar = entries.filter(([, v]) => !HANGUL_SPACE.test(v));
line('한글·공백 외 문자 0건', badChar.length === 0,
  `${badChar.length}건` + (badChar.length ? ' ' + badChar.slice(0, 12).map(([k, v]) => `${k}:${v}`).join(', ') : ''));

// ③ 빈 값 0건
const empty = entries.filter(([, v]) => !v || !v.trim());
line('빈 값 0건', empty.length === 0, `${empty.length}건`);

// ④ 단어 중복 0건 — 객체 리터럴은 뒤 값이 앞을 덮으므로 소스에서 직접 센다
const src = fs.readFileSync(path.join(ROOT, 'lib', 'wordplay', 'ko-meanings.ts'), 'utf-8');
const declared = [...src.matchAll(/^ {2}'([^']+)':|^ {2}"([^"]+)":/gm)].map((m) => m[1] ?? m[2]);
const dupWord = [...new Set(declared.filter((w, i, a) => a.indexOf(w) !== i))];
line(`단어 중복 0건 (소스 선언 ${declared.length}개)`, dupWord.length === 0 && declared.length === keys.length,
  dupWord.length ? dupWord.join(', ') : '없음');

console.log('\n=== 추가 항목 ===');

// ⑤ 8자 초과
const tooLong = entries.filter(([, v]) => [...v].length > MAX_LEN);
line(`${MAX_LEN}자 초과 0건`, tooLong.length === 0,
  `${tooLong.length}건` + (tooLong.length ? ' ' + tooLong.map(([k, v]) => `${k}:${v}(${[...v].length}자)`).join(', ') : ''));

// ⑥ 승계 139개가 표본과 **한 글자도** 다르지 않은가
const sampleRows = fs.readFileSync(SAMPLE, 'utf-8').replace(/\r\n/g, '\n').trim().split('\n').slice(1)
  .map((l) => l.split('\t'));
const inherited = sampleRows.filter(([w]) => w in KO_MEANINGS);
const drift = inherited.filter(([w, ko]) => KO_MEANINGS[w] !== ko);
line(`표본 승계 ${inherited.length}개 원문 동일`, drift.length === 0 && inherited.length === 139,
  drift.length ? drift.map(([w, ko]) => `${w}: 표본"${ko}" ≠ 사전"${KO_MEANINGS[w]}"`).join(' / ') : '전부 일치');

// ⑦ 뜻이 겹치는 묶음 상위 20 (동의어 확인용 — 오작성과 구분한다)
const byMeaning = {};
for (const [w, v] of entries) (byMeaning[v] ??= []).push(w);
const shared = Object.entries(byMeaning).filter(([, ws]) => ws.length > 1)
  .sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
console.log(`\n  뜻이 겹치는 묶음: ${shared.length}쌍 (겹친 단어 ${shared.reduce((a, [, w]) => a + w.length, 0)}개) — 상위 20:`);
for (const [ko, ws] of shared.slice(0, 20)) console.log(`    ${ko.padEnd(10)} ← ${ws.join(', ')}`);

console.log(`\n${fail.length ? '[FAIL] ' + fail.length + '개 항목 실패: ' + fail.join(' / ') : '[PASS] 전 항목 통과'}`);
process.exit(fail.length ? 1 : 0);
