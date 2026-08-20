import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

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
 * 단어 토큰 정규식 — 알파벳 + 내부 아포스트로피(축약형·소유격).
 *
 * 아포스트로피를 통째로 버리면 `don't` → `dont`가 되어 Polly mark의 `value`(`don't`)와
 * 매칭되지 않는다(word-audio.ts). 그래서 **단어 내부의** 아포스트로피만 남긴다.
 * 숫자·비ASCII 문자는 잡지 않는다(본문이 영어 산문 — ADR-0065 §1.1).
 */
const WORD_RE = /[A-Za-z]+(?:['‘’ʼ][A-Za-z]+)*/g;

/** 굽은 따옴표(’‘ʼ)를 곧은 따옴표로 통일한다. 원문에 커브 따옴표가 섞여 있다(ADR-0065 §1.1). */
const CURLY_APOSTROPHE_RE = /[‘’ʼ]/g;

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
   * 모든 등장이 대문자로 시작했는가 — **고유명사(등장인물 이름) 추정 신호**.
   *
   * ★ 필터에 쓰지 않는다. ADR-0065가 고유명사 처리를 규정하지 않았으므로 임의로 거르지
   *   않고, E-2b가 판단할 수 있도록 신호만 실어 보낸다(stopwords.ts 주석 §의도적으로
   *   넣지 않은 것들). 문장 첫머리 대문자와 구분하지 않는 **거친 신호**다.
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
  /** 필터를 통과한 고유 단어 수(상위 절단 이전). */
  eligibleWordCount: number;
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
  capitalizedCount: number;
  occurrences: WordOccurrence[];
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

      if (word.length < MIN_WORD_LENGTH || word.length > MAX_WORD_LENGTH) continue;
      if (STOPWORDS.has(word)) continue;

      const ordinal = seenOnPage.get(word) ?? 0;
      seenOnPage.set(word, ordinal + 1);

      const isCapitalized = raw[0] >= 'A' && raw[0] <= 'Z';
      const existing = buckets.get(word);

      if (existing) {
        existing.count += 1;
        if (isCapitalized) existing.capitalizedCount += 1;
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
          capitalizedCount: isCapitalized ? 1 : 0,
          occurrences: [
            { pageIndex: row.page_index, ordinal, tokenIndex: currentTokenIndex },
          ],
        });
      }
    }
  }

  const eligible = [...buckets.values()];

  // 후보 부족 — 진입점 미렌더(ADR-0065 §후보 부족 시 처리).
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
      alwaysCapitalized: b.capitalizedCount === b.count,
    }));

  return {
    bookId,
    totalPages: rows.length,
    totalTokens,
    eligibleWordCount: eligible.length,
    candidates,
  };
}
