import 'server-only';

import { resolveAudioBase } from '@/lib/book/audio-manifest';
import { QUIZ_QUESTION_IDS, type QuizQuestionId } from '@/lib/book/copy';

/**
 * 책 퀴즈 질문 음성 경로 해소 (ADR-0065 **Amendment #2** D-B4 · Q-2a).
 *
 * 문항 지시문을 한국어(Polly Seoyeon)로 **사전 생성**해 두고, 그 공개 URL을 돌려준다.
 *
 * ★ 사전 생성인 이유(D-B4): 런타임 합성을 하지 않는다. 재생 시점 지연·호출 비용·
 *   합성 편차를 만들지 않는다 — Amendment #1 D-A1이 단어 오디오에 세운 원칙과 같다.
 *   지시문은 **고정 문구 3개**라 책 수와 무관하게 총 개수가 상수다.
 *
 * ★ 스키마 무변경(D-A4 정신 승계): 경로가 문항 id에서 **유일하게 결정**되므로 정본을
 *   DB에 적지 않는다. 질문 음성은 책·자녀 어디에도 종속되지 않는 **화면 자산**이다.
 *
 *   {audioBase}/_quiz/{voice}/{id}.mp3
 *      예: _quiz/seoyeon/q1.mp3
 *
 *   `_words/{voice}/{key}.mp3`(단어 사전)와 형태가 같고 접두사만 다르다. 기존 책 오디오
 *   키(`{platform}-{slug}/{voice}/pNN.mp3`)와도 접두사가 겹치지 않아 무간섭이다.
 *
 * ★ `book_audio`를 **건드리지 않는다.** 그 테이블은 "책의 페이지 낭독" 정본이고
 *   (D-A4 `:517-541`), 질문 음성은 책에 속하지 않는다. 섞으면 `kind`가 의미를 잃는다 —
 *   단어 사전을 넣지 않은 것과 같은 이유다.
 *
 * ★ 매니페스트를 두지 않는다. 단어 사전은 목록이 1,877개에 증분 생성(D-A5)이 있어
 *   `_index.json`이 필요했지만, 여기는 **컴파일 시점에 아는 3개**가 전부다. 존재 여부를
 *   물어볼 것이 없으므로 조회도 없다 — 이 모듈은 **네트워크 접근 0건**이다.
 *
 * ★ 무기록(ADR-0065 D1): DB·Storage 쓰기 0건. 읽기조차 하지 않는다(문자열 조립뿐).
 */

/** 질문 음성 경로 접두사. 단어 사전 `_words`와 같은 층위의 전역 자산이다. */
export const QUIZ_AUDIO_PREFIX = '_quiz';

/**
 * 질문 음성 보이스 키(폴더명).
 *
 * 본문 낭독·단어 사전은 `danielle`(영어)다. 질문 지시문은 **한국어**라 다른 목소리를
 * 쓴다 — Polly `Seoyeon`(ko-KR). 보이스가 다르니 폴더도 갈린다(D-A4 경로 규칙 그대로).
 */
export const QUIZ_AUDIO_VOICE = 'seoyeon';

/** 질문 음성 1개의 재생 정보. 클라이언트 컴포넌트로 그대로 넘어가는 평문 객체다. */
export interface QuizQuestionAudio {
  id: QuizQuestionId;
  /** 공개 URL. 파일 **처음부터 끝까지** 재생하면 된다(구간 좌표 없음). */
  audioUrl: string;
}

export interface QuizQuestionAudioOptions {
  /** 오디오 base URL 상위 지정. 미지정 시 audio-manifest의 해소 체인을 쓴다. */
  audioBase?: string;
  /** 보이스 폴더명 상위 지정. 기본 'seoyeon'. */
  voice?: string;
}

/**
 * 문항 하나의 질문 음성 URL을 만든다.
 *
 * 존재 여부를 확인하지 않는다 — 3개 전부 사전 생성돼 있다는 전제다. 아직 업로드되지
 * 않았다면 재생만 조용히 실패하고 **화면 텍스트는 그대로 보인다**(D-B4 텍스트 병기가
 * 바로 이 상황의 안전망이다).
 */
export function resolveQuestionAudioUrl(
  id: QuizQuestionId,
  opts?: QuizQuestionAudioOptions,
): string {
  const base = resolveAudioBase(opts);
  const voice = opts?.voice ?? QUIZ_AUDIO_VOICE;
  return `${base}/${QUIZ_AUDIO_PREFIX}/${voice}/${id}.mp3`;
}

/** 문항 3종 전부의 질문 음성 URL을 화면 순서(하 → 중 → 상)대로 만든다. */
export function resolveQuestionAudio(
  opts?: QuizQuestionAudioOptions,
): QuizQuestionAudio[] {
  return QUIZ_QUESTION_IDS.map((id) => ({
    id,
    audioUrl: resolveQuestionAudioUrl(id, opts),
  }));
}
