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
  /** 페이지 mp3 공개 URL. playable=false면 null. */
  audioUrl: string | null;
  /** 재생 구간 시작(ms). */
  startMs: number | null;
  /** 재생 구간 끝(ms). */
  endMs: number | null;
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

  const clips = await resolveWordAudioClips(supabase, bookId, selection.candidates);

  // clips는 candidates와 같은 순서·같은 길이임이 보장된다(word-audio.ts @returns).
  const cards: WordPlayCard[] = selection.candidates.map((candidate, i) => {
    const clip = clips[i];
    return {
      word: candidate.word,
      playable: clip.playable,
      audioUrl: clip.audioUrl,
      startMs: clip.startMs,
      endMs: clip.endMs,
    };
  });

  return {
    bookId,
    cards,
    playableCount: cards.filter((c) => c.playable).length,
  };
}
