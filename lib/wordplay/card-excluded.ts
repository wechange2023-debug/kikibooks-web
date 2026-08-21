/**
 * 단어카드 **표시** 제외 목록 (ADR-0065 Amendment #3).
 *
 * `stopwords.ts`와 같은 패턴을 따른다 — 판정 리터럴을 이 파일 한 곳에만 두고,
 * `select-words.ts`의 후보 루프에서 단 한 번 참조한다.
 *
 * ── 왜 stopwords.ts와 분리하는가 ────────────────────────────────────────────
 * `stopwords.ts`는 성격이 다른 두 가지를 담고 있다.
 *   ① FUNCTION_STOPWORDS — 기능어(문법어라 카드 가치가 없다)
 *   ② LISTENING_EXCLUDED — **청취 검수** 결과(소리가 단어로 들리지 않는다)
 * 본 파일은 ③ **한글 뜻 카드 검수** 결과다. 뜻을 한 줄로 쓸 수 없거나,
 * 써도 아이에게 보여줄 수 없는 단어를 뺀다. 판정 맥락이 다르므로 섞지 않는다.
 *
 * ★ **청취 유지 ≠ 카드 표시 유지.**
 *   ADR-0065 Amd#1 1회전은 `wow`·`ugh`·`boom` 등을 "감탄사 계열은 유지"로 판정했다.
 *   그 판정의 맥락은 **mp3를 만들 가치가 있는가**였고, 답은 예였다(소리가 또렷하다).
 *   한글 뜻 카드의 질문은 다르다 — **뒤집으면 무엇을 보여줄 것인가**. `ugh`의 뜻은
 *   "윽"이고 `wow`는 "와"다. 이는 뜻이 아니라 같은 소리의 한글 표기라, 카드가
 *   가르치는 것이 없다. 그래서 청취에서 유지한 단어가 카드에서는 빠진다.
 *
 * ★ **이 제외는 카드 선정 한정이다.**
 *   이미 생성된 단어 mp3는 Storage(`_words/{voice}/`)에 **그대로 둔다**.
 *   지우지 않는다 — 청취 제외 27종(`stopwords.ts` LISTENING_EXCLUDED)과 똑같은 취급이다.
 *   매니페스트도 손대지 않는다. 카드가 그 단어를 고르지 않으므로 재생될 일이 없고,
 *   판정이 뒤집히면 mp3를 다시 만들지 않고 목록에서 빼기만 하면 된다.
 *
 * ── 판정 근거 ───────────────────────────────────────────────────────────────
 *   전량 1,855개 육안 스캔 + 보류 19건 원문 조회(2026-08-21).
 *   단어별 근거 한 줄: `scripts/wordcard_pilot/out/exclusion_candidates.tsv`
 *   보류 19건 조회 SQL: `scripts/wordcard_pilot/holdout_19_lookup.sql`
 *
 * ── 유지 판정(넣지 않은 것) — 되돌리기 쉬우므로 근거를 남긴다 ──────────────
 *   - 문화 격차 단어: `teff` `halwa` `samoosas` `stoep` `mealie` `cooldrink`
 *     `bajaj` `oakum` `durian` `maize`. 한국 아이에게 낯설 뿐 뜻은 한 줄로 쓰인다.
 *     낯섦은 제외 사유가 아니다 — 그림책으로 세계를 넓히는 것이 목적이다.
 *   - 기능어성 단어: `off` `back` `last` `yes` `upon` `mine`. 다의·기능어라 뜻을
 *     하나로 좁히기 어려우나, 빈출어라 빼면 카드가 비는 책이 생긴다.
 *   - ⑤ 경계 13종: `poo` `underwear` `dung` `crazy` `hate` `bullied` `attack`
 *     `whip` `skeleton` `widow` `injection` `deaf` `blind`. 유아 그림책에서 흔한
 *     소재이거나(`crazy`는 책 제목에도 쓰인다) 중립어다.
 *   - 종교어 12종: `god` `gods` `heaven` `soul` `disciples` `monks` `monastery`
 *     `pilgrimage` `parable` `church` `shepherd` `shepherds`. 뜻이 성립하고,
 *     원전이 종교 설화인 것은 콘텐츠 선정의 문제이지 단어의 문제가 아니다.
 *   - ADR 유지14 중 `knock`(두드리다)·`bye-bye`(작별 인사)·`t-shirt`(옷) 3종.
 *     소리·감탄사가 아니라 뜻이 성립하는 단어다.
 */

/** ① 인명·고유명사 (62) — 문장 첫머리에만 등장해 `alwaysCapitalized` 필터를 빠져나간 것들. */
const PROPER_NOUNS: readonly string[] = [
  'adaku', 'andi', 'anna', 'apiyo', 'binta', 'bittu',
  'bonke', 'brightbill', 'cindy', 'dinah', 'guddu', 'hassan',
  'jack', 'jimbo', 'jock', 'joe', 'john', 'kakyo',
  'khotso', 'kicchu', 'kolo', 'laurentia', 'len', 'lihle',
  'lilato', 'lule', 'maria', 'martin', 'mary', 'max',
  'miri', 'nandi', 'nani', 'neo', 'nosisi', 'ntuli',
  'nusha', 'nyabezi', 'palesa', 'peter', 'pinky', 'punch',
  'raju', 'roz', 'sandra', 'sara', 'sherry', 'siko',
  'simon', 'sipho', 'suddi', 'suresh', 'susu', 'tamara',
  'thandi', 'thao', 'thuli', 'tig', 'tinny', 'tsotang',
  'veronica', 'wamaitha',
];

/**
 * ② 비영어 단어 (18) — 영어 사전에 없는 현지어. 영어 낱말 카드가 성립하지 않는다.
 *
 * ※ `teff`·`samoosas`처럼 **영어 사전에 등재된 외래어는 넣지 않는다**(위 유지 판정).
 *   경계는 "낯선가"가 아니라 "영어 어휘인가"다.
 * ※ `isa`는 인명으로 오판했다가 원문에서 정정했다 — "Wemfula isa isa"의 영어 대역이
 *   바로 다음 줄 "O rain come come"이라 벰바어 come이다(O Rain Come, page_index 5).
 */
const NON_ENGLISH: readonly string[] = [
  // 1회전 (18)
  'dumelang', 'erotot', 'inswa', 'isa', 'luphi', 'maama',
  'molweni', 'mooi', 'nanhi', 'sawubona', 'tipite', 'twangale',
  'ubaba', 'ugogo', 'ukuphi', 'umntwana', 'usana', 'wemfula',

  // 2회전 (7) — 1회전 제외로 같은 책에서 새로 올라온 것들.
  // `Hello, baby!`는 인사말 다국어 그림책이라 응구니어 6종을 빼자 **아프리칸스어·츠와나어
  // 6종이 그 자리에 올라왔다**. 남은 카드 waar·die·baba·hallo·ngwana·kae가 그것이다.
  // ※ `die`는 영어 동사가 아니라 **아프리칸스어 정관사**다.
  //   원문 확인(page_index 4): "Waar is die baba?" — 어순·구성 모두 아프리칸스어다.
  // ※ `hallo`는 영국식 영어 변이 표기이기도 하나, 이 책에서는 `hello`가 **따로**
  //   카드로 잡혀 있어 아프리칸스어 인사말 쪽이다(원문 page_index 5 "Hallo!",
  //   바로 앞 4면이 아프리칸스어 면).
  'baba', 'die', 'hallo', 'kae', 'ngwana', 'waar',
  // Bemba 노래 "Twangale na mainsa"(비 오는 날에)의 잔여 어절. twangale는 1회전에서 제외.
  'mainsa',

  // 3회전 (5) — `Hello, baby!`가 **세 번째 언어 묶음**을 올렸다(소토어·벤다어·아프리칸스어).
  // 이 책은 다국어 인사말 그림책이라 한 묶음을 빼면 다음 언어가 올라온다.
  // 후보가 21종이라 진입점은 잃지 않지만, 회전이 언제 끝날지는 원문을 봐야 안다.
  'hokae',     // 소토어 어디
  'kha',       // 벤다어 계열
  'lesea',     // 소토어 아기
  'salani',    // 응구니어 작별 인사
  'totsiens',  // 아프리칸스어 작별 인사
  // ※ 같은 회차에 올라온 `ta-ta`는 **보류**다 — 영어 구어 작별 인사이기도 해서
  //   이 책이 영어 항목으로 실은 것인지 원문 없이는 못 가른다. 목록에 넣지 않았다.

  // 4회전 (5) — `Hello, baby!`의 **작별 인사편**.
  //
  // ★ 원문 확인(2026-08-21, page_index 12) — 이 다섯이 한 줄에 모여 있다:
  //     "Salani!  Totsiens!  Kha vha sale!  Hamba kakuhle!  Sepela gabotse!"
  //   응구니어·아프리칸스어·벤다어·코사어·츠와나어 작별 인사를 나란히 놓은 면이라,
  //   4·5회전에서 올라온 단어의 소속 언어가 이 한 줄로 전부 확정된다.
  'hamba',    // 코사어 가다 (hamba kakuhle = 잘 가)
  'kakuhle',  // 코사어 잘
  'sepela',   // 츠와나어 가다
  'vha',      // 벤다어 (kha vha sale = 잘 계세요)
  // ⚠️ `sale`은 **영어 낱말(판매)과 철자가 같다.** 위 원문에서 `Kha vha sale!`의
  //    일부임이 확인됐다(벤다어). 다만 현재 말뭉치에 이 책 1권뿐이라 성립하는 판정이다 —
  //    **영어 sale이 쓰인 책이 새로 적재되면 이 항목을 반드시 재검토해야 한다.**
  'sale',

  // 5회전 (1) — 위 같은 줄의 `Sepela gabotse!`. 츠와나어 "잘"(잘 가).
  'gabotse',

  // ── 같은 책에서 **유지**로 확정한 것 (2026-08-21 원문 판정) ──────────────
  // `ta-ta` — page_index 11 "Dumelang! Ta-ta!". 비영어 작별 인사는 전부 위 12면에
  //   모여 있으므로 이것은 그 묶음이 아니다. 영어 구어 작별 인사(잘 가)로 뜻이
  //   성립하므로 ④가 아니다 — ADR이 `bye-bye`를 "인사말이라 뜻이 성립"으로 유지한
  //   것과 같은 판정이다. 뺐다면 이 책은 후보 3종이 되어 진입점을 잃었다(855 → 854).
  // `hallo` 는 반대로 제외했다(위 2회전) — 같은 책에 `hello`가 **따로** 카드로 있고,
  //   원문 11·12면 구조상 아프리칸스어 면(4면 "Waar is die baba?")에 붙은 인사말이다.
];

/**
 * ③ 원문 철자 오류 (10) — 틀린 철자를 그대로 가르치게 된다.
 *
 * 원문을 고치지 않고 카드에서만 뺀다. `book_text`는 검수 확정본이자 낭독 입력이라
 * 여기서 손대면 오디오·하이라이트 정합이 깨진다(ADR-0046 D3).
 */
const MISSPELLINGS: readonly string[] = [
  'apon',        // upon
  'dazy',        // dazed
  'iwant',       // I want (붙여쓰기)
  'popcorns',    // popcorn (잘못된 복수형)
  'pouding',     // pudding
  'pute',        // poured / put
  'recces',      // recess
  'sheeps',      // sheep (잘못된 복수형)
  'tortose',     // tortoise
  'uponatime',   // upon a time (붙여쓰기)
];

/**
 * ④ 소리·감탄사 (40) — 한글 뜻 자리에 쓸 것이 "같은 소리의 한글 표기"뿐이다.
 *
 * ★ 이 중 12종은 ADR-0065 Amd#1이 **청취 유지**로 판정했던 단어다:
 *   `beep` `beep-beep` `boom` `buzz-buzz` `doof-doof` `hey` `hooray`
 *   `oops` `ugh` `wow` `yay` `yum`
 *   mp3는 그대로 두고 카드 선정에서만 뺀다(파일 머리말의 "청취 유지 ≠ 카드 표시 유지").
 */
const SOUNDS_AND_INTERJECTIONS: readonly string[] = [
  // 1회전 (40)
  'awe', 'beep', 'beep-beep', 'beepity', 'boom', 'bul',
  'buzz-buzz', 'bwoom', 'chapha', 'cluck', 'creak', 'doof-doof',
  'dubba', 'eeuw', 'eish', 'hey', 'hii', 'hoo',
  'hooray', 'khak', 'mba', 'mmawe', 'neh', 'oops',
  'oow', 'pow', 'splish', 'swoosh', 'thud', 'tick-tock',
  'tikte', 'tink', 'tsi', 'ugh', 'whoosh', 'woah',
  'wow', 'yay', 'yuck', 'yum',

  // 2회전 (3)
  'doof-doofs',  // 1회전에서 뺀 doof-doof의 복수형이 같은 책에서 올라왔다
  'weeeeeee',    // 표기 늘림 — Amd#1이 aaaaahhh·eeee를 뺀 것과 같은 부류
  'yho',         // 코사·남아공 감탄사

  // 3회전 (6) — `Senzo and the Sun`의 **w+e 표기 늘림 일괄**.
  //
  // Amd#1 3회전이 sh 계열 6종을 한 번에 넣어 회전을 끝낸 것과 같은 처리다.
  // 다만 근거가 더 강하다 — 이 계열은 **길이 상한으로 유한함이 증명된다**:
  //   select-words.ts MIN_WORD_LENGTH=3 · MAX_WORD_LENGTH=10 이므로
  //   가능한 표기는 `wee`(3자)부터 `weeeeeeeee`(10자)까지 **8종이 전부**다.
  // 그중 `wee`는 뜻이 있는 영어 낱말(작은)이라 **넣지 않는다**. 나머지 7종을 덮는다.
  //
  // 실제 관측: `weeeeeee`(2회전) · `weeeee`(3회전) 2종.
  // 아래 5종(weee·weeee·weeeeee·weeeeeeee·weeeeeeeee)은 **아직 나타나지 않았다** —
  // 한 종씩 빼면 회전만 늘어나므로 유한 집합을 미리 덮어 종결한다.
  'weee', 'weeee', 'weeeee', 'weeeeee', 'weeeeeeee', 'weeeeeeeee',
];

/**
 * ⑤ 민감어 (9) — 뜻은 성립하나 만 3~7세 카드에 띄울 말이 아니다.
 *
 * `cock`은 뜻(수탉)에 문제가 없으나 영어 낱말 자체의 이차 의미 때문에 뺀다.
 * 경계선 13종은 유지했다(파일 머리말 참조) — 이 목록은 좁게 잡는다.
 */
const SENSITIVE: readonly string[] = [
  // 1회전 (9)
  'bleeding', 'blood', 'cock', 'dead', 'kill', 'killed',
  'strangle', 'stupid', 'tumour',

  // 2회전 (1) — `dead`를 뺐더니 같은 뜻의 과거형이 올라왔다.
  'died',
];

/** 카드 선정에서 제외할 전체 집합. */
export const CARD_EXCLUDED: ReadonlySet<string> = new Set([
  ...PROPER_NOUNS,
  ...NON_ENGLISH,
  ...MISSPELLINGS,
  ...SOUNDS_AND_INTERJECTIONS,
  ...SENSITIVE,
]);

/** 유형별 개수 — ADR 기재 수치를 코드로 확인 가능하게 노출한다. */
export const CARD_EXCLUDED_COUNTS = {
  properNouns: new Set(PROPER_NOUNS).size,
  nonEnglish: new Set(NON_ENGLISH).size,
  misspellings: new Set(MISSPELLINGS).size,
  soundsAndInterjections: new Set(SOUNDS_AND_INTERJECTIONS).size,
  sensitive: new Set(SENSITIVE).size,
  total: CARD_EXCLUDED.size,
} as const;
