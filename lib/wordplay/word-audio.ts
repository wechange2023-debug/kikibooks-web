import 'server-only';

import { resolveAudioBase } from '@/lib/book/audio-manifest';
import type { WordCandidate } from '@/lib/wordplay/select-words';

/**
 * 단어 발음 오디오 해소 (ADR-0065 **Amendment #1** D-A1·D-A4 · W-1).
 *
 * 카드 단어 하나에 대해 **그 단어만 담긴 mp3의 URL**을 돌려준다.
 *
 * ★ 구간 재생 방식은 폐기됐다(Amendment #1 §배경). 종전에는 본문 mp3에서
 *   `[mark[i].time, mark[i+1].time)`을 잘라 썼는데, word mark가 **연속**이라
 *   여유를 주면 옆 단어를 침범하고(팀장 실청 `stop` → `and stop`), 여유를 빼면
 *   재생 오차가 어미를 잘랐다 — 침범과 잘림이 시소를 탔다. 단어를 단어로 만들면
 *   이웃이 없어 **침범이 구조적으로 불가능**하고, 파일 처음부터 재생하므로
 *   **seek 오차도 개입하지 않는다**.
 *
 * ★ marks 자산 자체는 존속한다(D-A6) — 오디오 리더의 단어 하이라이트가 계속 쓴다.
 *   폐기된 것은 "단어카드 구간 재생" 용도뿐이며, 그 계산 로직이 이 파일에서 사라졌다.
 *   구간 클램프·lead-in/tail 여유 상수도 함께 제거됐다(단독 파일 재생이라 불필요).
 *
 * ★ 스키마 무변경(D-A4): 단어 오디오는 책·자녀에 종속되지 않는 **전역 사전**이라
 *   DB에 정본을 적지 않는다. 경로가 단어에서 결정론적으로 나오고, 존재 여부는
 *   매니페스트(`_words/{voice}/_index.json`)가 답한다.
 *
 * ★ 본 모듈은 **읽기 전용**이다(ADR-0065 D1 무기록). DB 접근 0건 —
 *   Storage 공개 오브젝트 GET만 한다.
 */

/** 확정 보이스. audio-manifest.ts의 DEFAULT_READER_VOICE와 동일(ADR-0052 Amd#2). */
const DEFAULT_WORD_VOICE = 'danielle';

/** 단어 오디오 경로 접두사 (ADR-0065 D-A4). */
const WORDS_PREFIX = '_words';

/** 매니페스트 파일명 — 단어→key 목록. D-A5 증분 생성의 기준점이기도 하다. */
const MANIFEST_FILE = '_index.json';

/** 매니페스트 캐시 수명(ms). 증분 생성이 반영되도록 짧게 둔다. */
const MANIFEST_TTL_MS = 5 * 60 * 1000;

/** key 허용 문자 — gen_all_words.py `word_to_key`와 **같은 규칙이어야 한다**. */
const KEY_STRIP_RE = /[^a-z0-9-]/g;

/** 발음 재생 불가 사유. */
export type WordAudioFailure =
  /** 매니페스트에 없는 단어 — 아직 합성되지 않았다(신규 책 추가 직후 등). */
  | 'not-in-manifest'
  /** 매니페스트를 받지 못했다(네트워크·404). 전 단어가 이 사유로 접힌다. */
  | 'manifest-unavailable';

/** 단어 1개의 발음 오디오. */
export interface WordAudioClip {
  /** select-words의 정규형. */
  word: string;
  /** 재생 가능 여부. false여도 **카드에서 빼지 않는다**(ADR-0065 D4 — 표시만 한다). */
  playable: boolean;
  /** 단어 mp3 공개 URL. 불가 시 null. 파일 **처음부터 끝까지** 재생하면 된다. */
  audioUrl: string | null;
  /** playable=false일 때의 사유. */
  failure: WordAudioFailure | null;
}

export interface WordAudioOptions {
  /** 오디오 base URL 상위 지정. 미지정 시 audio-manifest의 해소 체인을 쓴다. */
  audioBase?: string;
  /** 보이스 폴더명. 기본 'danielle'. */
  voice?: string;
  /** fetch 구현 주입점(테스트·스크립트용). 기본은 전역 fetch. */
  fetchImpl?: typeof fetch;
}

interface WordManifest {
  voice: string;
  count: number;
  /** 정규형 단어 → 파일 key. */
  words: Record<string, string>;
}

/**
 * 정규형 단어 → Storage 파일 key (ADR-0065 D-A4).
 *
 * `'`를 제거하고 그 밖의 비허용 문자도 제거한다.
 *   said → said · buzz-buzz → buzz-buzz · don't → dont
 *
 * ★ scripts/wordplay/gen_all_words.py의 `word_to_key`와 **반드시 같은 결과**여야 한다.
 *   한쪽만 바꾸면 업로드된 파일과 조회 경로가 어긋나 전 단어가 조용히 재생 불가가 된다.
 */
export function wordToKey(word: string): string {
  return word.replace(/'/g, '').replace(KEY_STRIP_RE, '');
}

/** 단어 mp3의 공개 URL. */
function wordAudioUrl(audioBase: string, voice: string, key: string): string {
  return `${audioBase}/${WORDS_PREFIX}/${voice}/${key}.mp3`;
}

/** 프로세스 수명 동안의 매니페스트 캐시 — 카드 요청마다 받아오지 않는다. */
const manifestCache = new Map<string, { at: number; data: WordManifest | null }>();

async function loadManifest(
  audioBase: string,
  voice: string,
  doFetch: typeof fetch,
): Promise<WordManifest | null> {
  const cacheKey = `${audioBase}::${voice}`;
  const hit = manifestCache.get(cacheKey);
  if (hit && Date.now() - hit.at < MANIFEST_TTL_MS) {
    return hit.data;
  }

  let data: WordManifest | null = null;
  try {
    const res = await doFetch(
      `${audioBase}/${WORDS_PREFIX}/${voice}/${MANIFEST_FILE}`,
      { cache: 'no-store' },
    );
    if (res.ok) {
      const parsed = (await res.json()) as Partial<WordManifest>;
      if (parsed && typeof parsed.words === 'object' && parsed.words) {
        data = {
          voice: parsed.voice ?? voice,
          count: parsed.count ?? Object.keys(parsed.words).length,
          words: parsed.words as Record<string, string>,
        };
      }
    }
  } catch {
    // 네트워크 실패 — 발음만 빠지고 카드 자체는 그대로 보인다(가용성 우선).
    data = null;
  }

  manifestCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

/**
 * 카드 단어들의 발음 오디오를 해소한다.
 *
 * 매니페스트를 **한 번만** 받아 전 단어를 판정한다(카드 8장에 요청 1회).
 *
 * @param candidates select-words.ts가 고른 후보.
 * @returns 후보와 **같은 순서·같은 길이**의 배열. 재생 불가 단어도 `playable:false`로
 *   자리를 지킨다 — 카드에서 빼지 않는다(ADR-0065 D4).
 */
export async function resolveWordAudioClips(
  candidates: readonly WordCandidate[],
  opts?: WordAudioOptions,
): Promise<WordAudioClip[]> {
  const voice = opts?.voice ?? DEFAULT_WORD_VOICE;
  const audioBase = resolveAudioBase(opts);
  const doFetch = opts?.fetchImpl ?? fetch;

  const manifest = await loadManifest(audioBase, voice, doFetch);

  return candidates.map((candidate) => {
    if (!manifest) {
      return {
        word: candidate.word,
        playable: false,
        audioUrl: null,
        failure: 'manifest-unavailable' as const,
      };
    }

    // 매니페스트가 정본이다 — 목록에 없으면 파일도 없다(404를 만나기 전에 판정).
    const key = manifest.words[candidate.word];
    if (!key) {
      return {
        word: candidate.word,
        playable: false,
        audioUrl: null,
        failure: 'not-in-manifest' as const,
      };
    }

    return {
      word: candidate.word,
      playable: true,
      audioUrl: wordAudioUrl(audioBase, voice, key),
      failure: null,
    };
  });
}
