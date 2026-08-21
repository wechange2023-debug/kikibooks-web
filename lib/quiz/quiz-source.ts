import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveAudioBase } from '@/lib/book/audio-manifest';
import { QUIZ_QUESTION_IDS, type QuizQuestionId } from '@/lib/book/copy';
import { resolveQuestionAudioUrl } from '@/lib/quiz/question-audio';
import { eligibleQuestionIds } from '@/lib/quiz/build-quiz';
import { isTextPrintedOnImages } from '@/lib/quiz/text-printed';

/**
 * 책 퀴즈 **재료** 수집 (ADR-0065 Amendment #2 D-B3 · Q-2b).
 *
 * 책 1권에서 문항을 만드는 데 필요한 것 전부를 평문 객체로 모은다. **문항을 만들지는
 * 않는다** — 그것은 `lib/quiz/build-quiz.ts`의 일이다.
 *
 * ★ 둘을 가른 이유: **다시 하기가 재추첨**이기 때문이다(D-B2). 문항을 서버에서 조립하면
 *   다시 하기마다 왕복이 필요하다. 재료만 한 번 내려보내고 조립은 순수 함수로 두면
 *   클라이언트가 스스로 새로 뽑는다 — 단어 놀이가 쓰는 구조와 같다
 *   (`word-play.tsx:65` `buildQuestions`가 클라이언트에서 매번 shuffle한다).
 *
 * ★ 무기록(ADR-0065 D1 · D-B5): SELECT만. INSERT/UPDATE **0건**.
 * ★ 완독을 읽지 않는다(D-B2 A안): `reading_sessions` 조회 **0건**.
 *
 * @param supabase 호출자의 세션 클라이언트(publishable). **service role로 올리지 않는다** —
 *   `book_text`·`book_audio`는 anon/authenticated SELECT 공개읽기라 답이 같다.
 *   `lib/wordplay/get-word-play.ts:16-19`가 같은 근거로 같은 선택을 했다(ADR-0033).
 */

/** 본문 낭독 보이스 — `lib/book/audio-manifest.ts:104` DEFAULT_READER_VOICE와 같다. */
const READER_VOICE = 'danielle';

/** 페이지 오디오 행의 kind — 표지(`cover`)는 문항 재료가 아니다. */
const PAGE_KIND = 'page';

/** 문항 재료가 되는 한 면. */
export interface QuizPage {
  /** 0-based (ADR-0046 D2). ②의 "먼저 나온" 판정 기준이다. */
  pageIndex: number;
  /** `book_text.image_url` 원본 그대로 — 조립 0건(ADR-0057 D2). */
  imageUrl: string | null;
  /** trim한 본문. 빈 문자열이면 텍스트 없는 면이다. */
  text: string;
  /** 본문 페이지 mp3 공개 URL. **기존 자산 재사용** — 신규 합성 0건(D-B4). */
  audioUrl: string | null;
}

/** 문항 지시문 1개 — 화면 문구와 음성이 **같은 문장**이다(D-B4 텍스트 병기). */
export interface QuizPrompt {
  id: QuizQuestionId;
  text: string;
  /** Seoyeon 질문 음성(`_quiz/seoyeon/{id}.mp3`). */
  audioUrl: string;
}

/** 문항 조립에 필요한 전부. 클라이언트로 그대로 넘어가므로 평문만 담는다. */
export interface QuizSource {
  bookId: string;
  pages: QuizPage[];
  prompts: QuizPrompt[];
  /**
   * 삽화에 본문 문장이 인쇄된 계보인가 (Q-0 실측 · QB-1 확정).
   * true면 **문항 ③을 내지 않는다** — 정답 문장이 그림 안에 적혀 있어 완전 유출이다.
   * ①에는 적용하지 않는다(팀장 확정).
   */
  textPrintedOnImages: boolean;
}

/** 지시문 3종을 화면 순서대로 조립한다. 텍스트와 음성이 같은 id에서 함께 나온다. */
function buildPrompts(
  questionPrompts: Record<QuizQuestionId, string>,
): QuizPrompt[] {
  return QUIZ_QUESTION_IDS.map((id) => ({
    id,
    text: questionPrompts[id],
    audioUrl: resolveQuestionAudioUrl(id),
  }));
}

interface TextRow {
  page_index: number;
  text: string | null;
  image_url: string | null;
}

interface AudioRow {
  kind: string;
  page_index: number;
  audio_path: string;
}

/** 퀴즈 대상 책의 식별 정보 — `lib/book/detail.ts` Book에서 그대로 온다. */
export interface QuizBookRef {
  id: string;
  source_platform: string;
  source_id: string;
}

/**
 * 책 1권의 문항 재료를 모은다.
 *
 * `book_text`와 `book_audio`를 **병렬로** 한 번씩 읽는다. 오디오는 본문 보이스의
 * 페이지 행만 쓴다 — 표지 트랙은 문항이 될 수 없다(어느 면인지가 없다).
 */
export async function getQuizSource(
  supabase: SupabaseClient,
  book: QuizBookRef,
  questionPrompts: Record<QuizQuestionId, string>,
): Promise<QuizSource> {
  const [textResult, audioResult] = await Promise.all([
    supabase
      .from('book_text')
      .select('page_index, text, image_url')
      .eq('book_id', book.id)
      .order('page_index', { ascending: true })
      .returns<TextRow[]>(),
    supabase
      .from('book_audio')
      .select('kind, page_index, audio_path')
      .eq('book_id', book.id)
      .eq('voice', READER_VOICE)
      .returns<AudioRow[]>(),
  ]);

  if (textResult.error) {
    throw new Error(`getQuizSource: book_text 조회 실패 — ${textResult.error.message}`);
  }
  if (audioResult.error) {
    throw new Error(`getQuizSource: book_audio 조회 실패 — ${audioResult.error.message}`);
  }

  const audioBase = resolveAudioBase();
  const audioByPageIndex = new Map(
    (audioResult.data ?? [])
      .filter((row) => row.kind === PAGE_KIND)
      .map((row) => [row.page_index, `${audioBase}/${row.audio_path}`] as const),
  );

  const pages: QuizPage[] = (textResult.data ?? []).map((row) => ({
    pageIndex: row.page_index,
    imageUrl: row.image_url,
    // 생성 시 정본과 동일하게 trim (audio-manifest.ts:334 선례).
    text: (row.text ?? '').trim(),
    audioUrl: audioByPageIndex.get(row.page_index) ?? null,
  }));

  return {
    bookId: book.id,
    pages,
    prompts: buildPrompts(questionPrompts),
    textPrintedOnImages: isTextPrintedOnImages(book),
  };
}

/**
 * 책 퀴즈 진입 가능 여부만 판정한다 (celebrate 버튼 노출 게이트 · Q-2b).
 *
 * `lib/wordplay/get-word-play.ts`의 `hasWordPlay`와 **같은 모양**이다 — 진입점을 띄울지
 * 정할 때 화면 데이터까지 만들지 않는다.
 *
 * 출제 가능 문항이 **1개라도** 있으면 true. 0개면 버튼을 렌더하지 않는다 —
 * 안내 문구·비활성 버튼도 두지 않는다(ADR-0065 D2 조용한 미표시).
 *
 * ★ 판정은 `eligibleQuestionIds`(무작위 미개입)에 위임한다. 화면과 **같은 함수**를 써야
 *   "버튼은 보이는데 들어가면 빈 화면"이 생기지 않는다.
 */
export async function hasBookQuiz(
  supabase: SupabaseClient,
  book: QuizBookRef,
  questionPrompts: Record<QuizQuestionId, string>,
): Promise<boolean> {
  const source = await getQuizSource(supabase, book, questionPrompts);
  return eligibleQuestionIds(source).length > 0;
}
