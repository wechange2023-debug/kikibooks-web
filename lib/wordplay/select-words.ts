import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { CARD_EXCLUDED } from '@/lib/wordplay/card-excluded';
import { STOPWORDS } from '@/lib/wordplay/stopwords';

/**
 * 단어카드 후보 선정 (ADR-0065 D4 · §단어 선정 규칙 초안).
 *
 * 책 1권의 `book_text.text` 전 페이지를 읽어 카드로 낼 단어를 고른다.
 * **사전 계산 테이블을 쓰지 않는다** — 요청 시점 런타임 추출이다(ADR-0065 D4).
 *
 * ★ 무기록 원칙(ADR-0065 D1): 본 모듈은 **SELECT만 한다.** INSERT/UPDATE 0건.
 *
 * @param supabase 호출자가 넘긴 클라이언트. **본 모듈은 클라이언트를 만들지 않는다** —
 *   `selectReaderAudioBookIds`(lib/book/audio-manifest.ts:144, 그 함수 주석 §@param supabase)가
 *   확립한 선례를 따른다. service role과 publishable을 모두 받기 위해서다.
 *   `book_text`를 읽는 기존 경로도 동일하게 service role을 쓴다
 *   (lib/book/audio-manifest.ts:271-283 `getAudioReaderBook`).
 */

/** 카드 최소 개수. 미만이면 진입점을 렌더하지 않는다(ADR-0065 §후보 부족 시 처리, 제안값). */
export const MIN_CARDS = 4;
/** 카드 최대 개수 (ADR-0065 제안값 — 3~7세 집중 시간). */
export const MAX_CARDS = 8;
/** 단어 최소 길이 (ADR-0065 제안값). 2자 이하 기능어를 토큰 단계에서 걷어낸다. */
export const MIN_WORD_LENGTH = 3;
/** 단어 최대 길이 (ADR-0065 제안값 — 16px로 카드 1장에 들어가는 상한). */
export const MAX_WORD_LENGTH = 10;

/**
 * 단어 토큰 정규식 — 알파벳 + 내부 아포스트로피 + **내부 하이픈**.
 *
 * 아포스트로피를 통째로 버리면 `don't` → `dont`가 되어 Polly mark의 `value`(`don't`)와
 * 매칭되지 않는다. 그래서 **단어 내부의** 아포스트로피만 남긴다.
 * 숫자·비ASCII 문자는 잡지 않는다(본문이 영어 산문 — ADR-0065 §1.1).
 *
 * ★ 규칙 C (팀장 승인 2026-08-20) — 하이픈 복합어는 **쪼개지 않고 통단어**로 다룬다.
 *   종전에는 `Doof-Doofs`가 `doof`+`doofs` 두 토큰이 돼, Polly가 한 덩어리로 발음한
 *   마크(`Doof-Doofs`)와 매칭되지 않아 재생 불가로 빠졌다(E-2a 실측 — 하이픈 복합어가
 *   매칭 실패 35건의 주요 갈래였다). 통단어로 잡으면 발음도 표기도 원문과 일치한다.
 *   ASCII 하이픈만 잇는다 — em/en 대시(—·–)는 문장부호이므로 단어를 잇지 않는다.
 */
const WORD_RE = /[A-Za-z]+(?:['‘’ʼ-][A-Za-z]+)*/g;

/**
 * 길이 판정용 문자수 — **하이픈을 제외**하고 센다 (규칙 C).
 *
 * `well-known`(10자)은 하이픈을 빼면 9자라 상한 안에 든다. 하이픈은 표기 기호일 뿐
 * 발음 길이도 카드 폭도 늘리지 않으므로 길이 산정에서 뺀다.
 */
function letterLength(word: string): number {
  return word.replace(/-/g, '').length;
}

/**
 * 소유격(`-'s`)인가 — 규칙 B (팀장 승인 2026-08-20).
 *
 * `sherry's`·`yusuf's`처럼 소유격은 **기본형 존재 여부와 무관하게 일괄 제외**한다.
 * 카드로서 가르칠 형태가 아니고, 대개 인명에 붙어 고유명사 필터를 우회해 들어온다.
 *
 * ★ `'s`로 끝나는 것만 본다 — `don't`·`can't`·`I'll` 같은 다른 축약형은 **유지**한다
 *   (규칙 B 단서). `it's`·`he's` 등 `'s` 축약형은 이미 STOPWORDS에 있어 여기 오지 않는다.
 */
function isPossessive(word: string): boolean {
  return word.endsWith("'s");
}

/** 굽은 따옴표(’‘ʼ)를 곧은 따옴표로 통일한다. 원문에 커브 따옴표가 섞여 있다(ADR-0065 §1.1). */
const CURLY_APOSTROPHE_RE = /[‘’ʼ]/g;

/**
 * 문장 첫머리 판정 시 건너뛰는 여는 문장부호.
 * 그림책 본문은 대사가 많아 `“Come Mama, …”`처럼 따옴표가 앞에 붙는다.
 */
const OPENING_PUNCT = new Set(['"', "'", '“', '”', '‘', '’', '«', '»', '(', '[', '—', '-']);

/** 문장 종결부호 — 이 뒤의 첫 단어는 문장 첫머리다. */
const SENTENCE_END = new Set(['.', '!', '?']);

/**
 * `index` 위치의 토큰이 **문장 첫머리인가**.
 *
 * 고유명사 판정(alwaysCapitalized)에서 문장 첫 글자 대문자를 오탐하지 않기 위해 쓴다.
 * 뒤로 훑으며 공백·여는 문장부호를 건너뛰고, 직전 실질 문자가 `.!?`이면 문장 첫머리다.
 */
function isSentenceInitial(text: string, index: number): boolean {
  for (let i = index - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r') continue;
    if (OPENING_PUNCT.has(ch)) continue;
    return SENTENCE_END.has(ch);
  }
  return true; // 페이지 첫 토큰
}

/** 원문 토큰 → 대조용 정규형(소문자 + 아포스트로피 통일). */
export function normalizeWord(raw: string): string {
  return raw.toLowerCase().replace(CURLY_APOSTROPHE_RE, "'");
}

/** 한 단어가 책 안에서 등장한 위치 1건. */
export interface WordOccurrence {
  /** 0-based (book_text.page_index). */
  pageIndex: number;
  /**
   * 이 페이지 안에서 **같은 단어가** 몇 번째로 등장했는가 (0-based).
   * word-audio.ts가 여러 mark 중 어느 것을 고를지 판정하는 데 쓴다.
   */
  ordinal: number;
  /** 이 페이지 전체 토큰 배열에서의 인덱스 (0-based). 마크 매칭 보조 신호. */
  tokenIndex: number;
}

/** 카드 후보 1개. */
export interface WordCandidate {
  /** 정규형(소문자). 대조·매칭의 기준값. */
  word: string;
  /** 카드에 보여줄 표기 — **첫 등장 시의 원문 형태** 그대로. */
  display: string;
  /** 책 전체 등장 횟수. */
  count: number;
  /** 등장 위치 전량(페이지·순번 오름차순). */
  occurrences: WordOccurrence[];
  /**
   * 고유명사(등장인물 이름) 추정 — **문장 첫머리를 제외한** 모든 등장이 대문자로 시작.
   *
   * ★ E-2b에서 **후보 제외 필터로 승격**됐다(비기 결정 2026-08-20). E-2a 드라이런에서
   *   카드의 19%(1,303/6,846)가 `oluhle`·`makhulu`·`nathi` 같은 등장인물 이름이었고,
   *   이는 아이가 배울 영어 단어가 아니기 때문이다.
   *
   * ★ 문장 첫머리 등장은 판정에서 뺀다(`isSentenceInitial`). 빼지 않으면
   *   `"Water is good."`의 `Water`처럼 문장 앞에만 나온 보통명사가 고유명사로 오인돼
   *   과잉 제거된다. 문장 첫머리에서만 등장한 단어는 **판단 불가 → 고유명사 아님**으로
   *   보수적으로 처리한다(좋은 단어를 잃는 쪽보다 낫다).
   */
  alwaysCapitalized: boolean;
}

/** 한 책의 카드 선정 결과. */
export interface WordSelection {
  bookId: string;
  /** book_text 행 수(빈 텍스트 면 포함). */
  totalPages: number;
  /** 길이·불용어 필터 **이전**의 전체 토큰 수. */
  totalTokens: number;
  /** 필터를 통과한 고유 단어 수(상위 절단 이전, 고유명사·파생형 제거 후). */
  eligibleWordCount: number;
  /** 고유명사로 판정해 제외한 단어 수 (E-2b 필터 효과 계측용). */
  droppedProperNouns: number;
  /** 어형 중복으로 제거한 파생형 수 (E-2b 필터 효과 계측용). */
  droppedInflections: number;
  /** 규칙 B로 제외한 소유격 전량(정규형, 중복 없음). W-0 보고·감사용. */
  droppedPossessives: string[];
  /** 규칙 C로 통단어 취급한 하이픈 복합어 전량(정규형, 중복 없음). W-0 보고·감사용. */
  hyphenWords: string[];
  /** 최종 카드 후보 — 빈도 desc, 동점은 첫 등장 asc. 길이 MIN_CARDS~MAX_CARDS. */
  candidates: WordCandidate[];
}

interface TextRow {
  page_index: number;
  text: string | null;
}

/** 내부 집계 상태. */
interface Bucket {
  word: string;
  display: string;
  count: number;
  /** 책 전체 토큰 순서상 첫 등장 인덱스 — 동점 시 안정 정렬 키. */
  firstSeen: number;
  /** 문장 첫머리가 **아닌** 등장 횟수. 고유명사 판정의 모집단. */
  nonInitialCount: number;
  /** 그중 대문자로 시작한 횟수. */
  nonInitialCapCount: number;
  occurrences: WordOccurrence[];
}

/**
 * 경량 어형 중복 제거 (E-2b 0-b).
 *
 * 후보 목록 **안에 기본형이 있을 때만** `-s` 복수형을 접고, 빈도가 높은 쪽을 남긴다.
 * `-'s` 소유격은 규칙 B가 토큰 단계에서 이미 일괄 제외하므로 여기 도달하지 않는다.
 * 기본형이 목록에 없으면 파생형을 그대로 둔다 — 과잉 교정 금지(예: `clouds`만 있는 책에서
 * `cloud`로 바꾸지 않는다. 원문에 없는 표기를 카드에 띄우면 발음 매칭도 깨진다).
 *
 * 표제어화 라이브러리를 쓰지 않는다(Hard Rule 11). `-es`·불규칙 복수(`children`)는
 * 다루지 않는다 — 규칙이 커질수록 오교정 위험이 커지므로 가장 안전한 두 형태만 접는다.
 *
 * @returns 유지할 버킷 목록. 제거된 파생형 수는 호출자가 길이 차로 계산한다.
 */
function dedupeInflections(buckets: Bucket[]): Bucket[] {
  const byWord = new Map(buckets.map((b) => [b.word, b]));
  const dropped = new Set<string>();

  for (const bucket of buckets) {
    const word = bucket.word;
    const base =
      word.endsWith('s') && letterLength(word) > MIN_WORD_LENGTH
        ? word.slice(0, -1)
        : null;
    if (!base) continue;

    const baseBucket = byWord.get(base);
    if (!baseBucket || dropped.has(base) || dropped.has(word)) continue;

    // 빈도 높은 쪽을 남긴다. 동점이면 기본형을 남긴다(카드로서 더 일반적).
    dropped.add(bucket.count > baseBucket.count ? base : word);
  }

  return buckets.filter((b) => !dropped.has(b.word));
}

/**
 * 책 1권의 단어카드 후보를 고른다.
 *
 * 규칙(ADR-0065 §단어 선정 규칙 초안, 제안값 채택):
 *   소문자 정규화 → 구두점 제거(단어 내부 아포스트로피는 보존) → 3~10자 →
 *   불용어 제외 → **책 전체** 빈도 계산 → 동점은 첫 등장 순 → 상위 MAX_CARDS개.
 *
 * 빈도를 페이지별이 아니라 **책 전체로 합산**하는 이유: 페이지당 중앙값이 15단어라
 * (ADR-0065 §1.1) 페이지 단위로는 빈도 차가 거의 나지 않아 사실상 무작위가 된다.
 *
 * @returns 후보가 MIN_CARDS 미만이면 **null** — 진입점 미렌더 신호(ADR-0065 §후보 부족 시
 *   처리). 카드가 1~3장뿐인 경험보다 아예 없는 편이 낫다는 판단이다. `book_text` 행이
 *   0인 책(GDL 464권 — ADR-0065 D2)도 같은 경로로 null이 된다.
 */
export async function selectWordCards(
  supabase: SupabaseClient,
  bookId: string,
): Promise<WordSelection | null> {
  const { data, error } = await supabase
    .from('book_text')
    .select('page_index, text')
    .eq('book_id', bookId)
    .order('page_index', { ascending: true })
    .returns<TextRow[]>();

  if (error) {
    throw new Error(`selectWordCards: book_text 조회 실패 — ${error.message}`);
  }

  const rows = data ?? [];
  const buckets = new Map<string, Bucket>();
  /** 규칙 B로 걸러낸 소유격(보고용). */
  const possessives = new Set<string>();
  /** 규칙 C로 통단어가 된 하이픈 복합어(보고용). */
  const hyphenSeen = new Set<string>();
  let totalTokens = 0;

  for (const row of rows) {
    // 생성 시 정본과 동일하게 trim한다(lib/book/audio-manifest.ts:322 선례 —
    // 브리지가 strip한 텍스트로 TTS를 만들었으므로 오프셋·토큰 기준이 정합한다).
    const text = (row.text ?? '').trim();
    if (!text) continue;

    // 페이지 내 같은 단어의 등장 순번(ordinal) 카운터.
    const seenOnPage = new Map<string, number>();
    let tokenIndex = 0;

    for (const match of text.matchAll(WORD_RE)) {
      const raw = match[0];
      const word = normalizeWord(raw);
      const currentTokenIndex = tokenIndex;
      tokenIndex += 1;
      totalTokens += 1;

      // 규칙 C — 길이는 하이픈을 뺀 문자수로 판정한다.
      const len = letterLength(word);
      if (len < MIN_WORD_LENGTH || len > MAX_WORD_LENGTH) continue;
      // 불용어를 **먼저** 본다 — `it's`·`he's`·`that's`는 `'s`로 끝나지만 소유격이 아니라
      // 축약형(기능어)이다. 순서가 뒤바뀌면 이들이 "소유격으로 제외됨"으로 잘못 기록된다.
      if (STOPWORDS.has(word)) continue;
      // 카드 표시 제외(ADR-0065 Amd#3) — 인명·비영어·철자오류·소리감탄사·민감어.
      // 불용어 바로 옆에 두는 이유: 둘 다 "이 단어는 카드가 되지 않는다"는 같은 층의
      // 판정이라, 소유격·하이픈 집계에 잡히기 **전에** 함께 끊어야 기록이 어긋나지 않는다.
      // ★ 카드 선정 한정이다 — 이미 만든 단어 mp3는 Storage에 그대로 둔다
      //   (청취 제외 27종과 동일 취급. 근거는 card-excluded.ts 머리말).
      if (CARD_EXCLUDED.has(word)) continue;
      // 규칙 B — 소유격은 기본형 유무와 무관하게 일괄 제외한다.
      if (isPossessive(word)) {
        possessives.add(word);
        continue;
      }
      if (word.includes('-')) hyphenSeen.add(word);

      const ordinal = seenOnPage.get(word) ?? 0;
      seenOnPage.set(word, ordinal + 1);

      // 고유명사 판정 모집단 — 문장 첫머리 등장은 제외한다(대문자가 문법 때문이므로).
      const initial = isSentenceInitial(text, match.index);
      const isCapitalized = raw[0] >= 'A' && raw[0] <= 'Z';
      const existing = buckets.get(word);

      if (existing) {
        existing.count += 1;
        if (!initial) {
          existing.nonInitialCount += 1;
          if (isCapitalized) existing.nonInitialCapCount += 1;
        }
        existing.occurrences.push({
          pageIndex: row.page_index,
          ordinal,
          tokenIndex: currentTokenIndex,
        });
      } else {
        buckets.set(word, {
          word,
          // 첫 등장 시의 원문 표기를 카드 표시용으로 보존한다.
          display: raw.replace(CURLY_APOSTROPHE_RE, "'"),
          count: 1,
          firstSeen: totalTokens,
          nonInitialCount: initial ? 0 : 1,
          nonInitialCapCount: !initial && isCapitalized ? 1 : 0,
          occurrences: [
            { pageIndex: row.page_index, ordinal, tokenIndex: currentTokenIndex },
          ],
        });
      }
    }
  }

  const all = [...buckets.values()];

  // (a) 고유명사 제외 (E-2b 0-a). 문장 첫머리 등장만 있는 단어는 판단 불가 → 남긴다.
  const isProperNoun = (b: Bucket) =>
    b.nonInitialCount > 0 && b.nonInitialCapCount === b.nonInitialCount;
  const withoutProperNouns = all.filter((b) => !isProperNoun(b));
  const droppedProperNouns = all.length - withoutProperNouns.length;

  // (b) 경량 어형 중복 제거 (E-2b 0-b). 상위 절단 **이전**에 접어야 카드 8장이
  //     서로 다른 단어로 채워진다(lions/lion이 두 자리를 먹지 않는다).
  const eligible = dedupeInflections(withoutProperNouns);
  const droppedInflections = withoutProperNouns.length - eligible.length;

  // 후보 부족 — 진입점 미렌더(ADR-0065 §후보 부족 시 처리).
  // 고유명사·파생형을 걷어낸 **뒤**의 개수로 판정한다(E-2b 0-a 단서).
  if (eligible.length < MIN_CARDS) {
    return null;
  }

  // 빈도 desc → 동점은 첫 등장 asc(안정 정렬). 같은 책은 언제나 같은 카드가 나와야
  // 재실행 시 혼란이 없다(ADR-0065 §빈도 계산 범위).
  eligible.sort((a, b) => b.count - a.count || a.firstSeen - b.firstSeen);

  const candidates: WordCandidate[] = eligible
    .slice(0, MAX_CARDS)
    .map((b) => ({
      word: b.word,
      display: b.display,
      count: b.count,
      occurrences: b.occurrences,
      alwaysCapitalized: isProperNoun(b),
    }));

  return {
    bookId,
    totalPages: rows.length,
    totalTokens,
    eligibleWordCount: eligible.length,
    droppedProperNouns,
    droppedInflections,
    droppedPossessives: [...possessives].sort(),
    hyphenWords: [...hyphenSeen].sort(),
    candidates,
  };
}
