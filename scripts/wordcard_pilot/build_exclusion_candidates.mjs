/**
 * 단어카드 제외 후보 명단 — 전량 1,855개 스캔 결과 (지시서 E-2c-2).
 *
 * 정본 입력: scripts/wordplay/out/wordplay-dryrun-20260821.json → w0.unique_words (1,855)
 * 판정 유형(팀장 확정 5유형 + 보류):
 *   ① 인명(고유명사)  ② 비영어 단어  ③ 원문 철자 오류  ④ 소리·감탄사  ⑤ 민감어
 *   보류 = 확신 부족(억지 판정 금지)
 * 유지 2유형(기록하지 않음): 문화 격차 단어(teff·samoosas·stoep·mealie·cooldrink 등),
 *   기능어성 단어(off·back·last·yes 등)
 *
 * 판정 보조 수단(모두 로컬 JSON):
 *   - books[].cards 로 실린 책 제목 확인
 *   - 같은 책의 형제 카드로 문맥 판정 (예: Drum 책의 bul·mba 옆에 sound·drums·call)
 *   - 형태 단서(비영어 자모 배열·잘못된 복수형·붙여쓰기)
 * ※ 원문 문장은 읽지 않았다. 문맥 판정 근거는 책 제목과 형제 카드까지다.
 *
 * ★ DB·Storage 접근 0건.
 *
 * 실행: node scripts/wordcard_pilot/build_exclusion_candidates.mjs
 * 출력: scripts/wordcard_pilot/out/exclusion_candidates.tsv
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'scripts', 'wordplay', 'out', 'wordplay-dryrun-20260821.json');
const OUT = path.join(HERE, 'out', 'exclusion_candidates.tsv');

/** ADR-0065 Amd#1 3회전이 **유지**로 판정한 14종. 여기에 걸리면 Amendment 없이는 못 뺀다. */
const ADR_KEEP = new Set([
  'buzz-buzz', 'bye-bye', 'doof-doof', 'beep', 'boom', 'hey', 'hooray', 'knock',
  'oops', 'ugh', 'wow', 'yay', 'yum', 't-shirt',
]);
/** ADR-0065 Amd#1 3회전이 "제외하지 않는다"고 명시한 단어. */
const ADR_KEEP_EXPLICIT = new Set(['beep-beep']);

/** [단어, 유형, 판정근거] — 손으로 작성. */
const ROWS = [
  // ───────────── ① 인명(고유명사) ─────────────
  ['adaku', '①', '이보 여자 이름 · The Magic Pot'],
  ['andi', '①', '등장인물 이름 · The Box (같은 책에 max)'],
  ['anna', '①', '영어 이름 · 책 제목이 Anna 소유격'],
  ['apiyo', '①', '루오 이름 · Girl who did not listen'],
  ['binta', '①', '서아프리카 이름 · Wicked Friends.'],
  ['bittu', '①', '인도 이름 · Fun with Balloon'],
  ['bonke', '①', '응구니 이름 · Meerkat magic'],
  ['brightbill', '①', '등장인물 이름 · The wild robot (같은 책에 roz)'],
  ['cindy', '①', '영어 이름 · What is this I hear?'],
  ['dinah', '①', '영어 이름 · What Colors Do You Like?'],
  ['guddu', '①', '인도 이름 · Listen to my Body'],
  ['hassan', '①', '아랍계 이름 · Alake loves Visitors'],
  ['isa', '①', '이름 · O Rain Come (같은 책에 lilato)'],
  ['jack', '①', '영어 이름 · 책 제목 Jack the cunning jackal and Jimbo'],
  ['jimbo', '①', '영어 이름 · 위와 같은 책 제목에 등장'],
  ['jock', '①', '영어 이름 · 책 제목 Jock and Me'],
  ['joe', '①', '영어 이름 · I love oatmeal'],
  ['john', '①', '영어 이름 · Coach Joy and her players'],
  ['kakyo', '①', '이름 · We Are The Same'],
  ['khotso', '①', '세소토 이름 · Funny Story'],
  ['kicchu', '①', '인도 이름 · My fish 책'],
  ['laurentia', '①', '이름 · 책 제목 Laurentia the Great'],
  ['len', '①', '등장인물 이름 · Where the Pet Sat (sat mat hat cat 라임 그림책)'],
  ['lihle', '①', '줄루 이름 · 책 제목 Lihle has a great day'],
  ['lilato', '①', '세소토 이름 · O Rain Come'],
  ['lule', '①', '이름 · 책 제목 Lule and Kitty the Cat'],
  ['maria', '①', '이름 · 책 제목 Maria 소유격 cake'],
  ['martin', '①', '영어 이름 · Harold the Horse'],
  ['mary', '①', '영어 이름 · 책 제목 Mary is lazy'],
  ['max', '①', '등장인물 이름 · The Box (같은 책에 andi)'],
  ['miri', '①', '이름 · How do you eat?'],
  ['nandi', '①', '응구니 이름 · What if'],
  ['nani', '①', '이름 · 책 제목 Nani 소유격 Durian'],
  ['neo', '①', '세소토 이름 · 책 제목 Neo Finds Her Pig'],
  ['nosisi', '①', '코사 이름 · No!'],
  ['ntuli', '①', '응구니 성 · Thembi and the Singing'],
  ['nusha', '①', '이름 · The Girl Who Could Fly'],
  ['nyabezi', '①', '이름 · Crocodile and Baboon'],
  ['palesa', '①', '세소토 이름 · 책 제목 Palesa Can Walk'],
  ['peter', '①', '영어 이름 · Journey of a Star · Lule and Kitty the Cat'],
  ['pinky', '①', '등장인물 이름 · 책 제목이 Pinky'],
  ['punch', '①', '등장인물 이름 · 책 제목 Sniffles the Crocodile and Punch the Butterfly'],
  ['raju', '①', '인도 이름 · Rain, Rain'],
  ['roz', '①', '등장인물 이름 · The wild robot'],
  ['sandra', '①', '영어 이름 · Baby falls into the River Nile'],
  ['sara', '①', '이름 · 책 제목 Sara 소유격 Canoe'],
  ['sherry', '①', '등장인물 이름 · 책 제목 Sherry In the Market'],
  ['simon', '①', '영어 이름 · The wrong cereal.'],
  ['sipho', '①', '줄루 이름 · 책 제목 Sipho 소유격 flower garden'],
  ['suddi', '①', '이름 · The farmer and the magic pumpkin'],
  ['suresh', '①', '인도 이름 · Importance of trees'],
  ['tamara', '①', '이름 · 책 제목 Tamara Starts School'],
  ['thandi', '①', '응구니 이름 · Going Places'],
  ['thao', '①', '베트남 이름 · Fishing in My Village'],
  ['thuli', '①', '응구니 이름 · 책 제목 Thuli 소유격 Tissue'],
  ['tig', '①', '등장인물 이름 · 책 제목 Tig 소유격 World'],
  ['tsotang', '①', '세소토 이름 · Neo Finds Her Pig'],
  ['veronica', '①', '영어 이름 · Drawing a rainbow'],
  ['wamaitha', '①', '키쿠유 이름 · Fruits of Freedom'],

  // ───────────── ② 비영어 단어 ─────────────
  ['dumelang', '②', '츠와나어 인사말 · Hello, baby (비영어 인사말 7개가 한 책에 모임)'],
  ['molweni', '②', '코사어 인사말 · Hello, baby'],
  ['sawubona', '②', '줄루어 인사말 · Hello, baby'],
  ['ubaba', '②', '줄루어 아버지 · Hello, baby'],
  ['ugogo', '②', '줄루어 할머니 · Hello, baby'],
  ['ukuphi', '②', '줄루어 어디 · Hello, baby'],
  ['umntwana', '②', '줄루어 아이 · Hello, baby'],
  ['usana', '②', '줄루어 아기 · Hello, baby'],
  ['luphi', '②', '줄루어 어디 · Hello, baby'],
  ['wemfula', '②', '응구니어 비 관련 어형 · O Rain Come'],
  ['maama', '②', '루간다어 어머니 · The Girl Who Played'],
  ['mooi', '②', '아프리칸스어 예쁜 · Akhona and the Rainbow'],
  ['nanhi', '②', '힌디어 작은 · Chhuk-Chhuk-Chhak (인도 기차 그림책)'],

  // ───────────── ③ 원문 철자 오류 ─────────────
  ['tortose', '③', 'tortoise 오기 · 책 제목은 Hare and Tortoise인데 본문만 틀림'],
  ['apon', '③', 'upon 오기 · The wrong cereal.'],
  ['uponatime', '③', 'upon a time 붙여쓰기 · 같은 책에 upon이 따로 카드로 있음'],
  ['iwant', '③', 'I want 붙여쓰기 · I do not want to go to sleep 책'],
  ['sheeps', '③', 'sheep의 잘못된 복수형 · Jack the cunning jackal and Jimbo'],
  ['pouding', '③', 'pudding 오기 · The Cereal. (형제 카드 cereal breakfast bowl poured)'],

  // ───────────── ④ 소리·감탄사 (ADR 유지14 미충돌) ─────────────
  ['beepity', '④', '소리 흉내 · Shhhhh 책 (전화 라디오 트럭 소리 나열)'],
  ['bul', '④', '북소리 흉내 · Drum (형제 카드 drums sound call)'],
  ['bwoom', '④', '소리 흉내 · The Tree that Could not See'],
  ['chapha', '④', '물 튀는 소리 흉내 · Rain for Nomvula (형제 카드 water raining rain)'],
  ['cluck', '④', '닭 울음 흉내 · 이미 제외된 moo oink woof와 같은 부류'],
  ['creak', '④', '삐걱 소리 흉내 · I Am Not Afraid'],
  ['dubba', '④', '소리 흉내 · Shhhhh 책 (형제 카드 beepity)'],
  ['eeuw', '④', '역겨움 감탄사 · How About You?'],
  ['eish', '④', '남아공 감탄사 · Nomvundla and the Chilli-Eating Contest'],
  ['hii', '④', '당나귀 울음 흉내 · Why Donkey cries louder than Horse (형제 카드 cried cry hoo)'],
  ['hoo', '④', '울음소리 흉내 · 위와 같은 책'],
  ['khak', '④', '목 소리 흉내 · Watch Out The Tiger is Here (같은 책 ahuuun은 ADR 2회전에서 이미 제외)'],
  ['mba', '④', '북소리 흉내 · Drum (형제 카드 bul sound)'],
  ['mmawe', '④', '비영어 감탄사 · 책 제목 AAAAAHHH Mmawe'],
  ['neh', '④', '남아공 영어 종결 감탄사 · Baby Talk'],
  ['oow', '④', '감탄사 · Watch Out The Tiger is Here'],
  ['pow', '④', '타격음 흉내 · The Hungry Crocodile'],
  ['splish', '④', '물소리 흉내 · Senzo and the Sun (이미 제외된 splash와 같은 부류)'],
  ['swoosh', '④', '바람 소리 흉내 · Mali 소유격 Friend'],
  ['thud', '④', '쿵 소리 흉내 · Leela Learns to Ride'],
  ['tick-tock', '④', '시계 소리 흉내 · 책 제목 Tick-Tock, Tick-Tock...'],
  ['tikte', '④', '자동차 소리 흉내 · My Car (형제 카드 boom)'],
  ['tink', '④', '새 금속 소리 흉내 · King of the Birds · The Clever Little Bird'],
  ['whoosh', '④', '바람 소리 흉내 · Thuli 소유격 Tissue'],
  ['woah', '④', '감탄사 · Whose button is this? · My Special Blankie'],
  ['yuck', '④', '역겨움 감탄사 · Let us go on a litter hunt (eeuw와 같은 부류)'],

  // ───────────── ④ 소리·감탄사 (★ ADR 유지14 충돌 — Amendment 필요) ─────────────
  ['beep', '④', '★ADR 유지14 · 기계음 흉내 · Senzo and the Sun · The Memory Tree'],
  ['beep-beep', '④', '★ADR 3회전이 명시적으로 제외하지 않기로 한 단어 · Senzo and the Sun'],
  ['boom', '④', '★ADR 유지14 · 큰 소리 흉내 · My Special Blankie 외 2권'],
  ['buzz-buzz', '④', '★ADR 유지14 · 벌 소리 흉내 · Banzi 소유격 Busy Bees'],
  ['doof-doof', '④', '★ADR 유지14 · 소리 흉내 · The 3 Doof-Doofs'],
  ['hey', '④', '★ADR 유지14 · 부르는 감탄사 · Rafiki 소유격 Style'],
  ['hooray', '④', '★ADR 유지14 · 환호 감탄사 · The Things That Really Matter'],
  ['oops', '④', '★ADR 유지14 · 실수 감탄사 · Mom 소유격 Red Coat'],
  ['ugh', '④', '★ADR 유지14 · 불쾌 감탄사 · What Is It EDITED BY WADE'],
  ['wow', '④', '★ADR 유지14 · 감탄사 · Look up · The Box'],
  ['yay', '④', '★ADR 유지14 · 환호 감탄사 · No!'],
  ['yum', '④', '★ADR 유지14 · 맛 감탄사 · Number O'],

  // ───────────── ⑤ 민감어 ─────────────
  ['strangle', '⑤', '목 조르기 · The coneys and the genet'],
  ['kill', '⑤', '죽이다 · Proverbs of the Nyungwe People'],
  ['killed', '⑤', '죽였다 · WICKED KING TIGER'],
  ['dead', '⑤', '죽은 · The Hyena 소유격 Funeral'],
  ['blood', '⑤', '피 · Narrow Escape · Colours'],
  ['bleeding', '⑤', '피 흘리는 · 책 제목 The Bleeding Apple'],
  ['stupid', '⑤', '비하어 · Clever woman'],
  ['cock', '⑤', '뜻은 수탉이나 영어 이차 의미 때문에 카드 노출 부적절 · Domestic Birds'],
  ['tumour', '⑤', '종양 · Kate is in heaven (죽음 문맥)'],

  // ───────────── 보류 (확신 부족) ─────────────
  ['awe', '보류', '표준 영어 명사 경외이나 남아공 영어에선 인사 감탄사 · Do not Cry My Child'],
  ['bajaj', '보류', '에티오피아 삼륜택시 · 상표 유래이나 현지 영어에선 보통명사 · Abebech, the female bajaj driver'],
  ['bathtime', '보류', 'bath time 붙여쓰기인지 고유 합성어인지 불명 · Bathtub Safari'],
  ['birdy', '보류', '영어 구어 새 애칭이나 등장인물 별명일 수 있음 · Small Bird 소유격 Big Adventure'],
  ['dazy', '보류', 'daisy dazed 오기 추정이나 형제 카드 crazy와의 라임일 수도 · The man that could...'],
  ['erotot', '보류', '비영어 어휘인지 인명인지 불명 · Child As a Peacemaker'],
  ['goo', '보류', '표준 영어 끈적한 것이나 형제 카드 eeuw 옆이라 소리일 수도 · How About You?'],
  ['inswa', '보류', '잠비아 지역어 날개미 추정 · 확증 없음 · The New Road'],
  ['kolo', '보류', '인명 놀이 이름 비영어 어느 쪽인지 불명 · The Girl Who Played'],
  ['oakum', '보류', '표준 영어 뱃밥이나 펭귄 그림책에 나올 맥락이 아님 · Feathered Friends'],
  ['popcorns', '보류', '잘못된 복수형인지 인명인지 불명 · 책 제목이 SAM POPCORNS'],
  ['pute', '보류', 'put puts 오기 추정 · 같은 책에 apon 오기 존재 · The wrong cereal.'],
  ['recces', '보류', 'recess 쉬는 시간 오기 추정 · A New School'],
  ['siko', '보류', '인명 추정이나 형제 카드에 단서 없음 · The Hungry Green Frog'],
  ['susu', '보류', '인명 비영어 소리 어느 쪽인지 불명 · It is MY book'],
  ['tinny', '보류', '표준 영어 양철 같은인지 tiny 오기인지 불명 · Whose button is this?'],
  ['tipite', '보류', '비영어 어휘 추정 · 형제 카드에 소리 단서 없음 · Animals Dig a Well'],
  ['tsi', '보류', '비영어 어휘 추정 · 형제 카드에 소리 단서 없음 · Pumpkins?'],
  ['twangale', '보류', '인명 지명 추정 · O Rain Come'],
  ['poo', '보류', '⑤ 경계 — 유아 그림책에서 흔한 소재 · Wiggle Jiggle'],
  ['underwear', '보류', '⑤ 경계 — 일상 의복어 · Cat and Dog Dog is cold'],
  ['dung', '보류', '⑤ 경계 — 농사 동물 문맥 · How do you eat?'],
  ['crazy', '보류', '⑤ 경계 — 비하어이나 책 제목에도 쓰임 · Crazy Animals'],
  ['hate', '보류', '⑤ 경계 — 감정어 · 책 제목 I Hate Winter'],
  ['bullied', '보류', '⑤ 경계 — 학교폭력 주제어 · New hope'],
  ['attack', '보류', '⑤ 경계 — There is an alien in my house'],
  ['whip', '보류', '⑤ 경계 — 채찍인지 휘젓기인지 불명 · Pig That Would not Listen'],
  ['skeleton', '보류', '⑤ 경계 — 책 제목 Skeleton bones'],
  ['widow', '보류', '⑤ 경계 — 사별 개념 · The Widow and the Judge'],
  ['injection', '보류', '⑤ 경계 — 주사 · Brave Bora'],
  ['deaf', '보류', '⑤ 경계 — 장애 표현 · Wewak Boy'],
  ['blind', '보류', '⑤ 경계 — 장애 표현 · 책은 장애 긍정 주제 · They Can Do Many Things'],
];

// ── 검증 ──
const data = JSON.parse(fs.readFileSync(SRC, 'utf-8'));
const counts = data.w0.word_book_counts;
const all = new Set(data.w0.unique_words);

const notInList = ROWS.filter(([w]) => !all.has(w)).map(([w]) => w);
if (notInList.length) {
  console.error('[STOP] 1,855 목록에 없는 단어: ' + notInList.join(', '));
  process.exit(1);
}
const dup = ROWS.map((r) => r[0]).filter((w, i, a) => a.indexOf(w) !== i);
if (dup.length) {
  console.error('[STOP] 중복 단어: ' + [...new Set(dup)].join(', '));
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  ['단어\t유형\t실린책수\t판정근거', ...ROWS.map(([w, t, r]) => `${w}\t${t}\t${counts[w]}\t${r}`)].join('\n') + '\n',
  'utf-8',
);

// ── 요약 ──
const byType = {};
for (const [w, t] of ROWS) (byType[t] ??= []).push(w);
const order = ['①', '②', '③', '④', '⑤', '보류'];
console.log('산출: ' + path.relative(ROOT, OUT).split(path.sep).join('/'));
console.log('');
for (const t of order) console.log(`  ${t} : ${(byType[t] ?? []).length}건`);
const excl = order.slice(0, 5).reduce((a, t) => a + (byType[t] ?? []).length, 0);
console.log('  ─────────────');
console.log('  후보 합계(①~⑤) : ' + excl);
console.log('  보류            : ' + (byType['보류'] ?? []).length);
console.log('  명단 총계        : ' + ROWS.length);
console.log('');
console.log('  1855 − 후보 = ' + (1855 - excl) + '   (보류까지 빼면 ' + (1855 - ROWS.length) + ')');

const adrHit = ROWS.filter(([w]) => ADR_KEEP.has(w) || ADR_KEEP_EXPLICIT.has(w));
console.log('');
console.log('  ★ ADR 유지14/명시유지와 겹치는 후보 : ' + adrHit.length + '건');
console.log('    ' + adrHit.map((r) => r[0]).join(', '));
const adrSafe = [...ADR_KEEP, ...ADR_KEEP_EXPLICIT].filter((w) => !ROWS.some((r) => r[0] === w));
console.log('    (후보에 넣지 않은 유지14 잔여 : ' + adrSafe.join(', ') + ')');

const MUST = ['hii', 'adaku', 'veronica', 'peter', 'isa', 'dumelang', 'tortose', 'whoosh', 'ugh', 'strangle', 'cock'];
const miss = MUST.filter((w) => !ROWS.some((r) => r[0] === w));
console.log('');
console.log('  표본150 문제단어 11종 교차확인 : ' + (miss.length ? 'FAIL → 누락 ' + miss.join(', ') : '11/11 포함 PASS'));
