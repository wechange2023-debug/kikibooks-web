import type { QuizQuestionId } from '@/lib/book/copy';
import type { QuizPage, QuizPrompt, QuizSource } from '@/lib/quiz/quiz-source';

/**
 * 책 퀴즈 문항 조립 (ADR-0065 Amendment #2 D-B3 · QB-4·QB-5 · Q-2b).
 *
 * 재료(`QuizSource`)를 받아 문항을 만든다. **순수 함수**라 서버·클라이언트 어디서든
 * 돌아가고, 부를 때마다 새로 뽑는다 — 그것이 "다시 하기 = 재추첨"의 구현이다(D-B2).
 *
 * ★ 무기록(D1 · D-B5): 시드를 저장하지 않는다. 무엇을 냈는지 남기지 않으므로 "이전과
 *   다른 문제"를 보장할 수도 없고, 보장할 필요도 없다.
 * ★ 외부 라이브러리 0건(Hard Rule 11). shuffle은 자체 구현이다.
 * ★ 오답 보기는 **같은 책 안에서만** 뽑는다 — 책 밖 콘텐츠를 섞지 않는다.
 *
 * 출제 방식(QB-5 확정): **매번 3문항 전부**를 **하 → 중 → 상 고정 순서**로 낸다.
 *   조건 미달 문항은 건너뛴다 — 억지로 채우지 않는다. 3문항이 안 되면 2문항으로 낸다.
 */

/** ① 그림 보기 수. Q-0 출제 조건 "상이한 삽화 ≥ 3"과 같은 수다. */
const Q1_CHOICES = 3;
/** ② 그림 보기 수 — **2장 고정**(QB-4 팀장 확정). */
const Q2_CHOICES = 2;
/** ③ 문장 보기 수. Q-0 출제 조건 "문장 텍스트 ≥ 3"과 같은 수다. */
const Q3_CHOICES = 3;

/** 그림 보기 1개. `key`는 면 식별자(pNN) — 정답 대조와 React key에 함께 쓴다. */
export interface QuizImageChoice {
  key: string;
  imageUrl: string;
}

/** 문장 보기 1개. */
export interface QuizTextChoice {
  key: string;
  text: string;
}

interface QuizQuestionBase {
  id: QuizQuestionId;
  /** 화면에 병기하는 지시문 = 음성 대본(D-B4). */
  prompt: string;
  /** Seoyeon 질문 음성 URL. */
  promptAudioUrl: string;
  /** 정답 보기의 `key`. */
  answerKey: string;
}

/** ① 문장 듣고 그림 찾기 (하). */
export interface QuizListenPickImage extends QuizQuestionBase {
  id: 'q1';
  /** 문제로 들려줄 **본문 페이지 mp3**. 기존 자산 재사용 — 신규 합성 0건. */
  clipUrl: string;
  choices: QuizImageChoice[];
}

/** ② 먼저 나온 장면 (중). */
export interface QuizPickEarlierScene extends QuizQuestionBase {
  id: 'q2';
  choices: QuizImageChoice[];
}

/** ③ 그림 보고 문장 찾기 (상). */
export interface QuizLookPickSentence extends QuizQuestionBase {
  id: 'q3';
  imageUrl: string;
  choices: QuizTextChoice[];
}

export type QuizQuestion =
  | QuizListenPickImage
  | QuizPickEarlierScene
  | QuizLookPickSentence;

/** 면 식별자 — 0-based page_index를 안정 문자열로. */
function pageKey(page: QuizPage): string {
  return `p${page.pageIndex}`;
}

/** Fisher–Yates. 외부 라이브러리 없이 자체 구현(Hard Rule 11 · word-play.tsx:50 선례). */
function shuffle<T>(input: readonly T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickOne<T>(input: readonly T[]): T {
  return input[Math.floor(Math.random() * input.length)];
}

/**
 * 삽화가 **서로 다른** 면만 남긴다. 같은 그림이 두 보기로 나오면 정답이 둘이 된다.
 * 먼저 나온 면을 대표로 남긴다 — ②의 "먼저 나온" 판정이 흔들리지 않게 하기 위해서다.
 */
function distinctImagePages(pages: readonly QuizPage[]): QuizPage[] {
  const seen = new Set<string>();
  const out: QuizPage[] = [];
  for (const page of pages) {
    if (!page.imageUrl || seen.has(page.imageUrl)) continue;
    seen.add(page.imageUrl);
    out.push(page);
  }
  return out;
}

/** 본문이 **서로 다른** 면만 남긴다(같은 문장이 두 보기가 되는 것을 막는다). */
function distinctTextPages(pages: readonly QuizPage[]): QuizPage[] {
  const seen = new Set<string>();
  const out: QuizPage[] = [];
  for (const page of pages) {
    if (!page.text || seen.has(page.text)) continue;
    seen.add(page.text);
    out.push(page);
  }
  return out;
}

/** ①의 재료 — 오디오와 삽화를 **둘 다** 가진 면들 중 삽화가 서로 다른 것. */
function q1Pool(source: QuizSource): QuizPage[] {
  return distinctImagePages(
    source.pages.filter((p) => p.audioUrl !== null && p.imageUrl !== null),
  );
}

/** ②의 재료 — 삽화가 서로 다른 면(오디오 불필요). */
function q2Pool(source: QuizSource): QuizPage[] {
  return distinctImagePages(source.pages);
}

/** ③의 재료 — 보기가 될 문장 면들과, 문제로 낼 삽화를 가진 면들. */
function q3Pool(source: QuizSource): { sentences: QuizPage[]; anchors: QuizPage[] } {
  const sentences = distinctTextPages(source.pages);
  return {
    sentences,
    // 문제 그림은 **그 문장이 있는 면**의 그림이어야 한다 — 그래야 정답이 정해진다.
    anchors: sentences.filter((p) => p.imageUrl !== null),
  };
}

/**
 * 출제 가능한 문항 id를 화면 순서대로 돌려준다. **무작위가 개입하지 않는다** —
 * celebrate의 진입 버튼 노출 판정(조용한 미표시, D2)이 이 함수를 그대로 쓴다.
 *
 * 조건 (Q-0 실측 §4와 같은 정의):
 *   q1 — 페이지 오디오 존재 + 상이한 삽화 ≥ 3
 *   q2 — 상이한 삽화 ≥ 2
 *   q3 — 상이한 삽화 ≥ 1 + 문장 ≥ 3 + **문장 인쇄 계보가 아닐 것**(QB-1)
 */
export function eligibleQuestionIds(source: QuizSource): QuizQuestionId[] {
  const out: QuizQuestionId[] = [];

  if (q1Pool(source).length >= Q1_CHOICES) out.push('q1');
  if (q2Pool(source).length >= Q2_CHOICES) out.push('q2');

  if (!source.textPrintedOnImages) {
    const { sentences, anchors } = q3Pool(source);
    if (anchors.length >= 1 && sentences.length >= Q3_CHOICES) out.push('q3');
  }

  return out;
}

function promptOf(source: QuizSource, id: QuizQuestionId): QuizPrompt {
  const found = source.prompts.find((p) => p.id === id);
  if (!found) {
    throw new Error(`buildQuiz: 지시문 누락 — ${id}`);
  }
  return found;
}

function buildQ1(source: QuizSource): QuizListenPickImage | null {
  const pool = q1Pool(source);
  if (pool.length < Q1_CHOICES) return null;

  const picked = shuffle(pool).slice(0, Q1_CHOICES);
  // 정답은 그중 하나 — 이미 전부 오디오·삽화를 가졌으므로 아무나 되어도 성립한다.
  const answer = pickOne(picked);
  const prompt = promptOf(source, 'q1');

  return {
    id: 'q1',
    prompt: prompt.text,
    promptAudioUrl: prompt.audioUrl,
    answerKey: pageKey(answer),
    clipUrl: answer.audioUrl as string,
    choices: shuffle(picked).map((p) => ({
      key: pageKey(p),
      imageUrl: p.imageUrl as string,
    })),
  };
}

function buildQ2(source: QuizSource): QuizPickEarlierScene | null {
  const pool = q2Pool(source);
  if (pool.length < Q2_CHOICES) return null;

  const picked = shuffle(pool).slice(0, Q2_CHOICES);
  // 정답 = page_index가 작은 쪽. 삽화가 서로 다른 면만 남겼으므로 동률이 없다.
  const answer = picked.reduce((a, b) => (a.pageIndex <= b.pageIndex ? a : b));
  const prompt = promptOf(source, 'q2');

  return {
    id: 'q2',
    prompt: prompt.text,
    promptAudioUrl: prompt.audioUrl,
    answerKey: pageKey(answer),
    choices: shuffle(picked).map((p) => ({
      key: pageKey(p),
      imageUrl: p.imageUrl as string,
    })),
  };
}

function buildQ3(source: QuizSource): QuizLookPickSentence | null {
  if (source.textPrintedOnImages) return null;

  const { sentences, anchors } = q3Pool(source);
  if (anchors.length < 1 || sentences.length < Q3_CHOICES) return null;

  const answer = pickOne(anchors);
  const distractors = shuffle(sentences.filter((p) => p.text !== answer.text)).slice(
    0,
    Q3_CHOICES - 1,
  );
  const prompt = promptOf(source, 'q3');

  return {
    id: 'q3',
    prompt: prompt.text,
    promptAudioUrl: prompt.audioUrl,
    answerKey: pageKey(answer),
    imageUrl: answer.imageUrl as string,
    choices: shuffle([answer, ...distractors]).map((p) => ({
      key: pageKey(p),
      text: p.text,
    })),
  };
}

/**
 * 문항을 조립한다. 매 호출 새로 뽑는다(재추첨).
 *
 * @returns 하 → 중 → 상 고정 순서. 조건 미달 문항은 빠진다(2문항이 될 수 있다).
 *   전부 미달이면 빈 배열 — 호출자가 화면을 띄우지 않는다.
 */
export function buildQuiz(source: QuizSource): QuizQuestion[] {
  return [buildQ1(source), buildQ2(source), buildQ3(source)].filter(
    (q): q is QuizQuestion => q !== null,
  );
}
