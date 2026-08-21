/**
 * 단어카드 한글 뜻 — 표본 150개 TSV 생성 + 자체 형식 검증 (지시서 E-2c-1 STEP 3·4).
 *
 * 한글 뜻은 워커가 직접 작성했다(외부 사전 미사용, 팀장 확정 방침).
 * 뜻 원본을 이 파일(KO)에 두는 이유: 산출물 경로 `out/` 은 .gitignore 전역 규칙에
 * 걸려 추적되지 않는다. 손으로 쓴 데이터가 out/ 에만 있으면 유실된다.
 *
 * 작성 규칙 (지시서 STEP 3):
 *   - 단어당 뜻 1개 · 한글과 공백만 · 8자 이내 · 품사 표기 없음
 *   - 만 3~7세 기준으로 가장 쉽고 일상적인 뜻. 다의어는 그림책 문맥을 따른다
 *     (문맥은 wordplay 드라이런의 `books[].cards` 로 어느 책에 실렸는지 확인해 판정).
 *
 * ★ DB·Storage 접근 0건.
 *
 * 실행: node scripts/wordcard_pilot/build_ko_tsv.mjs
 * 출력: scripts/wordcard_pilot/out/sample_150_ko.tsv
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SAMPLE = path.join(HERE, 'out', 'sample_150_words.tsv');
const OUT = path.join(HERE, 'out', 'sample_150_ko.tsv');

const MAX_LEN = 8;

/** 단어 → 한글 뜻 (손으로 작성). */
const KO = {
  // ── ① 빈도 상위 50 ──
  said: '말했다',
  one: '하나',
  day: '날',
  school: '학교',
  says: '말한다',
  like: '좋아하다',
  time: '시간',
  big: '큰',
  mother: '엄마',
  went: '갔다',
  see: '보다',
  people: '사람들',
  play: '놀다',
  out: '밖으로',
  friends: '친구들',
  house: '집',
  animals: '동물들',
  home: '우리 집',
  father: '아빠',
  man: '남자',
  tree: '나무',
  water: '물',
  look: '쳐다보다',
  asked: '물었다',
  children: '아이들',
  food: '음식',
  village: '마을',
  old: '나이 많은',
  called: '불렀다',
  girl: '여자아이',
  little: '작은',
  eat: '먹다',
  friend: '친구',
  dog: '개',
  back: '뒤',
  beautiful: '아름다운',
  family: '가족',
  get: '얻다',
  baby: '아기',
  love: '사랑하다',
  got: '얻었다',
  long: '긴',
  river: '강',
  boy: '남자아이',
  help: '돕다',
  lived: '살았다',
  good: '좋은',
  away: '멀리',
  bird: '새',
  come: '오다',

  // ── ② 무작위 100 (seed=42) ──
  charge: '돌진하다',
  spinach: '시금치',
  give: '주다',
  boastful: '잘난 척하는',
  months: '여러 달',
  seven: '일곱',
  stars: '별들',
  woman: '여자',
  flour: '밀가루',
  pretty: '예쁜',
  swim: '헤엄치다',
  trunk: '코끼리 코',
  word: '낱말',
  dive: '뛰어들다',
  bother: '귀찮게 하다',
  firewood: '땔나무',
  secret: '비밀',
  bath: '목욕',
  half: '반',
  peter: '피터',
  dig: '파다',
  god: '하느님',
  wolves: '늑대들',
  grows: '자란다',
  dormouse: '겨울잠쥐',
  scrambled: '휘저어 익힌',
  adaku: '아다쿠',
  trading: '사고팔기',
  puppy: '강아지',
  salt: '소금',
  become: '되다',
  singing: '노래하기',
  dancing: '춤추기',
  syrup: '시럽',
  burned: '불탔다',
  daddy: '아빠',
  princess: '공주',
  veronica: '베로니카',
  strongest: '가장 센',
  footprint: '발자국',
  teff: '곡식',
  rabbit: '토끼',
  drawings: '그림들',
  church: '교회',
  whoosh: '휙',
  bin: '쓰레기통',
  collecting: '모으기',
  brightly: '밝게',
  slate: '작은 칠판',
  spices: '양념',
  eagle: '독수리',
  swallow: '삼키다',
  visit: '찾아가다',
  off: '떨어져',
  adventures: '모험',
  jackets: '외투',
  crawl: '기어가다',
  storybook: '이야기책',
  drawing: '그림',
  cheeks: '볼',
  responds: '대답한다',
  knock: '똑똑 두드리다',
  race: '달리기 시합',
  sand: '모래',
  stick: '막대기',
  emotions: '감정',
  wig: '가발',
  bright: '밝은',
  halwa: '달콤한 과자',
  mum: '엄마',
  gathered: '모았다',
  make: '만들다',
  wise: '지혜로운',
  flower: '꽃',
  trapped: '갇힌',
  hare: '산토끼',
  hii: '당나귀 소리',
  rods: '낚싯대',
  expecting: '기다리는',
  maize: '옥수수',
  last: '마지막',
  stones: '돌멩이',
  mat: '돗자리',
  yard: '마당',
  talk: '이야기하다',
  eyes: '눈',
  customers: '손님들',
  ugh: '윽',
  climb: '오르다',
  dumelang: '안녕하세요',
  uncle: '삼촌',
  stuck: '달라붙은',
  tortose: '거북',
  longer: '더 긴',
  child: '아이',
  isa: '이사',
  strangle: '목을 조르다',
  process: '과정',
  cock: '수탉',
  smelling: '냄새 맡는',
};

// ── 표본 목록(정본 순서)을 그대로 따른다 ──
const lines = fs.readFileSync(SAMPLE, 'utf-8').replace(/\r\n/g, '\n').trim().split('\n');
const rows = lines.slice(1).map((l) => {
  const [word, count, basis] = l.split('\t');
  return { word, count: Number(count), basis };
});

const missing = rows.filter((r) => !KO[r.word]).map((r) => r.word);
if (missing.length) {
  console.error('[STOP] 뜻이 없는 단어 ' + missing.length + '개: ' + missing.join(', '));
  process.exit(1);
}
const extra = Object.keys(KO).filter((w) => !rows.some((r) => r.word === w));
if (extra.length) {
  console.error('[STOP] 표본에 없는 뜻이 섞였습니다: ' + extra.join(', '));
  process.exit(1);
}

const out = ['단어\t한글뜻\t선정근거', ...rows.map((r) => `${r.word}\t${KO[r.word]}\t${r.basis}`)];
fs.writeFileSync(OUT, out.join('\n') + '\n', 'utf-8');

// ── STEP 4 자체 형식 검증 ──
const HANGUL_SPACE = /^[\uAC00-\uD7A3 ]+$/;
const data = out.slice(1).map((l) => l.split('\t'));
const badChar = data.filter(([, ko]) => !HANGUL_SPACE.test(ko));
const empty = data.filter(([w, ko, b]) => !w || !ko || !b || !ko.trim());
const dupWord = [...new Set(data.map((d) => d[0]).filter((w, i, a) => a.indexOf(w) !== i))];
const tooLong = data.filter(([, ko]) => [...ko].length > MAX_LEN);
const dupKo = Object.entries(
  data.reduce((m, [w, ko]) => ((m[ko] ??= []).push(w), m), {}),
).filter(([, ws]) => ws.length > 1);

const pass = (ok) => (ok ? 'PASS' : 'FAIL');
console.log('산출: ' + path.relative(ROOT, OUT).split(path.sep).join('/'));
console.log('① 데이터 행 수 = 150          : ' + data.length + ' ' + pass(data.length === 150));
console.log('② 한글뜻 열 한글·공백 외 문자  : ' + badChar.length + '건 ' + pass(badChar.length === 0) +
  (badChar.length ? ' → ' + badChar.map((d) => d[0] + ':' + d[1]).join(', ') : ''));
console.log('③ 빈 값                        : ' + empty.length + '건 ' + pass(empty.length === 0));
console.log('④ 단어 중복                    : ' + dupWord.length + '건 ' + pass(dupWord.length === 0) +
  (dupWord.length ? ' → ' + dupWord.join(', ') : ''));
console.log('(참고) 8자 초과                : ' + tooLong.length + '건' +
  (tooLong.length ? ' → ' + tooLong.map((d) => d[0] + ':' + d[1]).join(', ') : ''));
console.log('(참고) 뜻이 겹치는 단어쌍      : ' + dupKo.length + '쌍' +
  (dupKo.length ? ' → ' + dupKo.map(([ko, ws]) => ws.join('/') + '=' + ko).join(', ') : ''));
const basisCount = data.reduce((m, [, , b]) => ((m[b] = (m[b] ?? 0) + 1), m), {});
console.log('선정근거 분포                  : ' + JSON.stringify(basisCount));

process.exit(data.length === 150 && !badChar.length && !empty.length && !dupWord.length ? 0 : 1);
