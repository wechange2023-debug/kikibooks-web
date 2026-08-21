import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { selectWordCards } from '@/lib/wordplay/select-words';
import { resolveWordAudioClips } from '@/lib/wordplay/word-audio';

/**
 * 단어 놀이 화면 데이터 조립 (ADR-0065 D3·D4 · E-2b).
 *
 * celebrate 페이지가 호출해 **진입점을 렌더할지**와 **카드에 무엇을 띄울지**를 한 번에
 * 결정한다. null이면 진입점 자체를 렌더하지 않는다(ADR-0065 D2 조용한 미표시).
 *
 * ★ 무기록(ADR-0065 D1): SELECT + Storage 읽기만. 쓰기 0건.
 *
 * @param supabase 호출자의 세션 클라이언트(publishable). service role 승격 0건 —
 *   `book_text`·`book_audio` 모두 anon/authenticated SELECT 공개읽기라 동일한 답이 나온다
 *   (ADR-0034 (d) · lib/book/audio-manifest.ts:135-137이 같은 근거로 같은 선택을 했다).
 *   ADR-0033 안전 원칙(불필요한 secret 키 사용 회피) 정합.
 */

/** 카드 1장에 필요한 전부. 클라이언트 컴포넌트로 그대로 넘어가므로 평문 객체만 담는다. */
export interface WordPlayCard {
  /** 정규형(소문자). 카드 표면에 그대로 표시한다. */
  word: string;
  /** 발음 재생 가능 여부. false면 스피커 아이콘을 숨긴다(E-2b 1-e). */
  playable: boolean;
  /**
   * **단어 단독 mp3**의 공개 URL. playable=false면 null.
   *
   * ★ ADR-0065 Amendment #1(W-1)로 본문 구간 재생이 폐기됐다 — 이제 이 URL은
   *   그 단어만 담긴 파일이므로 **처음부터 끝까지** 재생하면 된다.
   *   구간 좌표(startMs·endMs)는 더 이상 존재하지 않는다.
   */
  audioUrl: string | null;
}

export interface WordPlayData {
  bookId: string;
  cards: WordPlayCard[];
  /** 발음 재생 가능한 카드 수 — 퀴즈 출제 가능 여부 판정에 쓴다(E-2b 2-g). */
  playableCount: number;
}

/**
 * 책 1권의 단어 놀이 데이터를 만든다.
 *
 * @returns 카드가 MIN_CARDS 미만이거나 `book_text`가 없으면 **null**
 *   (= 진입점 미렌더). GDL 464권이 이 경로로 조용히 걸러진다(ADR-0065 D2).
 */
export async function getWordPlay(
  supabase: SupabaseClient,
  bookId: string,
): Promise<WordPlayData | null> {
  const selection = await selectWordCards(supabase, bookId);
  if (!selection) {
    return null;
  }

  // 매니페스트 1회 조회로 전 단어를 판정한다(DB 접근 0건 — Storage 읽기만).
  const clips = await resolveWordAudioClips(selection.candidates);

  // clips는 candidates와 같은 순서·같은 길이임이 보장된다(word-audio.ts @returns).
  const cards: WordPlayCard[] = selection.candidates.map((candidate, i) => {
    const clip = clips[i];
    return {
      word: candidate.word,
      playable: clip.playable,
      audioUrl: clip.audioUrl,
    };
  });

  return {
    bookId,
    cards,
    playableCount: cards.filter((c) => c.playable).length,
  };
}

/**
 * 진입점을 렌더할지만 판정한다 — 카드 내용은 만들지 않는다 (Amd#2 D-B1 · Q-1).
 *
 * celebrate가 "단어 놀이 해볼까?" 버튼을 띄울지 정할 때 쓴다. 놀이 자체가 전용 화면
 * `/book/[id]/wordplay`로 빠지면서, celebrate는 **카드가 필요 없어졌다**.
 *
 * ★ `getWordPlay() !== null`과 **결과가 같다.** 위 함수가 null을 반환하는 경로는
 *   `selectWordCards()`가 null인 경우 **하나뿐**이기 때문이다(`:56-58`).
 *   그래서 이 함수는 판정을 바꾸지 않으면서 Storage 매니페스트 조회 1건을 아낀다 —
 *   발음 재생 가능 여부는 버튼 노출과 무관하다(재생 불가 카드도 표시는 된다).
 *
 * ★ 무기록(ADR-0065 D1): SELECT만. 쓰기 0건.
 *
 * @returns 카드가 MIN_CARDS 이상 확보되면 true. GDL 464권은 여기서 false가 되어
 *   **조용히 미표시**된다(ADR-0065 D2 — 안내 문구·비활성 버튼을 두지 않는다).
 */
export async function hasWordPlay(
  supabase: SupabaseClient,
  bookId: string,
): Promise<boolean> {
  return (await selectWordCards(supabase, bookId)) !== null;
}
