import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveAudioBase } from '@/lib/book/audio-manifest';
import { normalizeWord, type WordCandidate } from '@/lib/wordplay/select-words';

/**
 * 단어 발음 구간 좌표 산출 (ADR-0065 D4 · Q3).
 *
 * 카드 단어 하나를 **해당 페이지 오디오의 어느 구간에서 재생하면 되는지**를 계산한다.
 * 오디오를 자르거나 새로 만들지 않는다 — 기존 mp3의 재생 구간(ms)만 돌려준다.
 *
 * ★ 무기록 원칙(ADR-0065 D1): 본 모듈은 **SELECT + Storage 읽기만** 한다.
 *
 * ★ Storage 접근은 **기존 오디오 재생 경로를 그대로 따른다**(신규 방식 발명 0건):
 *   - URL 조립 = `{audioBase}/{book_audio.audio_path | marks_path}`
 *     — lib/book/audio-manifest.ts:331-332 (`getAudioReaderBook`)와 동일
 *   - audioBase 해소 = opts → `NEXT_PUBLIC_TTS_AUDIO_BASE` → Supabase 공개 버킷
 *     — lib/book/audio-manifest.ts:213-221 (`resolveAudioBase`)와 동일 체인
 *   - marks 파싱 = line-delimited JSON에서 `type === 'word'`만
 *     — components/book/audio-reader.tsx:124-145 (`parseMarks`)의 포트
 *   - 오디오 경로는 **book_audio 행을 정본으로 읽는다**(추측 조립 금지)
 *     — lib/book/audio-manifest.ts:23-30에 박제된 원칙
 *
 * ※ base 해소는 audio-manifest.ts의 `resolveAudioBase`를 **직접 import**한다(E-2b 통합).
 *   E-2a에서는 `AUDIO_STORAGE_PREFIX`가 module-private이라 리터럴을 복제했는데,
 *   하드코딩된 Storage 접두사는 과거 전 면 404를 만든 전력이 있어(audio-manifest.ts:15-21)
 *   해당 함수를 export로 승격하고 본 모듈이 그것을 쓰도록 정리했다 — 리터럴 단일 출처.
 */

/** 본문 낭독 트랙 kind. audio-manifest.ts:106 `READER_AUDIO_KIND`와 동일. */
const READER_AUDIO_KIND = 'page';

/** 확정 보이스. audio-manifest.ts:104 `DEFAULT_READER_VOICE`와 동일(ADR-0052 Amd#2). */
const DEFAULT_READER_VOICE = 'danielle';

/**
 * 마지막 단어의 재생 상한 (ADR-0065 Q3 처리, 제안값 1.5초).
 *
 * 다음 mark가 없으면 끝 시각을 알 수 없다. `duration_ms`(오디오 전체 길이)와
 * `start + 이 상한` 중 **이른 쪽**을 쓴다 — 페이지 끝의 긴 무음까지 재생하지 않기 위해서다.
 */
export const LAST_WORD_MAX_MS = 1500;

/**
 * 구간 앞뒤 여유 — **재생 타이밍 오차 흡수용** (E-2b 결함 수정, 2026-08-20).
 *
 * ★ atempo 가설은 실측으로 반증됐다. 파이프라인이 이미 marks를 보정해 저장한다
 *   (scripts/tts_pilot/run_tts_fullbatch.py:333
 *    `marks = [{**m, "time": int(round(m["time"] / atempo))} ...]`).
 *   Storage 서빙본이 로컬 배포본(스케일 완료)과 일치함을 대조로 확인했다 —
 *   native 650·925ms → 배포·서빙 765·1088ms (비 1.1769 = 1/0.85). 추가 스케일은 오히려 틀린다.
 *
 * ★ 실제 잘림 원인은 **구간 폭에 여유가 0**이라는 점이다. 종전 규칙은
 *   `[mark[i].time, mark[i+1].time)`로 앞말과 뒷말 사이를 빈틈없이 잘랐는데, 재생 쪽에는
 *   피할 수 없는 오차가 있다:
 *     - mp3 seek은 프레임 단위로 양자화된다(1152 샘플 @24kHz = **48ms**)
 *     - ffmpeg 재인코딩으로 붙는 인코더 지연(수십 ms)을 브라우저가 항상 벗겨주지 않는다
 *   드라이런 실측 구간 길이는 중앙값 559ms·최소 118ms였다. 최소 구간에서는 48ms 오차만으로도
 *   40%가 날아간다 — "대부분의 단어가 뭉개지고 잘린다"는 증상과 일치한다.
 *
 * 그래서 앞에 lead-in, 뒤에 tail을 두고 최소 길이를 보장한다. 뒷말로 조금 번지는 것은
 * 허용한다 — 발음을 온전히 듣는 편이 낫다.
 */
/** 구간 시작을 이만큼 앞당긴다(제안값). seek이 단어 시작보다 늦게 떨어지는 것을 흡수. */
export const LEAD_IN_MS = 60;
/** 구간 끝을 이만큼 늘린다(제안값 — 지시서 제안 범위 80~120ms 내). 어미 잘림 방지. */
export const TAIL_MS = 110;
/** 최소 구간 길이(제안값). `a`처럼 118ms짜리 구간은 눌러도 들리지 않는다. */
export const MIN_CLIP_MS = 320;

/** 발음 재생 불가 사유. 실패율 실측용으로 분류를 남긴다(ADR-0065 D4). */
export type WordAudioFailure =
  /** 이 책·보이스에 해당 페이지의 book_audio 행이 없다. */
  | 'no-audio-row'
  /** book_audio 행은 있으나 marks_path가 비어 있다. */
  | 'no-marks-path'
  /** marks 파일을 받지 못했다(네트워크·404). */
  | 'marks-fetch-failed'
  /** marks는 받았으나 단어와 일치하는 mark가 없다(표기 차이 등). */
  | 'word-not-matched';

/** 단어 1개의 발음 구간. */
export interface WordAudioClip {
  /** select-words의 정규형. */
  word: string;
  /** 재생 가능 여부. false여도 **카드 후보에서 빼지 않는다**(ADR-0065 D4). */
  playable: boolean;
  /** 재생할 페이지 오디오(0-based page_index). 불가 시 null. */
  pageIndex: number | null;
  /** 페이지 mp3 공개 URL. 불가 시 null. */
  audioUrl: string | null;
  /** 구간 시작(ms). */
  startMs: number | null;
  /** 구간 끝(ms). */
  endMs: number | null;
  /** playable=false일 때의 사유. */
  failure: WordAudioFailure | null;
}

interface AudioRow {
  page_index: number;
  audio_path: string;
  marks_path: string | null;
  duration_ms: number | null;
}

/** Polly word speech mark 1건. components/book/highlighted-text.tsx:22-31과 동일 형태. */
interface WordMark {
  time: number;
  value: string;
  start: number;
  end: number;
}

export interface WordAudioOptions {
  /** 오디오 base URL 상위 지정. 미지정 시 env → Supabase 공개 버킷 순으로 해소한다. */
  audioBase?: string;
  /** book_audio.voice 필터. 기본 'danielle'. */
  voice?: string;
  /** marks 파일 fetch 구현 주입점(테스트·드라이런용). 기본은 전역 fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * line-delimited speech marks JSON 파싱(word만).
 * components/book/audio-reader.tsx:124-145의 포트 — 깨진 줄은 건너뛴다.
 */
export function parseMarks(raw: string): WordMark[] {
  const out: WordMark[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const m = JSON.parse(t) as Partial<WordMark> & { type?: string };
      if (m.type === 'word' && typeof m.time === 'number') {
        out.push({
          time: m.time,
          value: String(m.value ?? ''),
          start: Number(m.start),
          end: Number(m.end),
        });
      }
    } catch {
      // 깨진 줄은 건너뛴다(구간 산출만 영향, 페이지 재생 무관).
    }
  }
  return out;
}

/**
 * 카드 단어들의 발음 구간을 산출한다.
 *
 * 단어마다 등장 위치를 순서대로 훑어 **처음으로 재생 가능한 구간 1개**를 찾는다
 * (발음은 한 번만 들려주면 되므로 모든 등장을 다 계산하지 않는다). 한 페이지의 marks는
 * 한 번만 받아 캐시하므로, 카드 8장이 같은 페이지에 몰려도 fetch는 1회다.
 *
 * @param candidates select-words.ts가 고른 후보. 각 후보의 `occurrences`를 그대로 쓴다.
 * @returns 후보와 **같은 순서·같은 길이**의 배열. 재생 불가 단어도 `playable:false`로
 *   자리를 지킨다 — 카드에서 빼지 않는다(ADR-0065 D4 "카드 후보에서 제외하지 않음").
 */
export async function resolveWordAudioClips(
  supabase: SupabaseClient,
  bookId: string,
  candidates: readonly WordCandidate[],
  opts?: WordAudioOptions,
): Promise<WordAudioClip[]> {
  const voice = opts?.voice ?? DEFAULT_READER_VOICE;
  const audioBase = resolveAudioBase(opts);
  const doFetch = opts?.fetchImpl ?? fetch;

  // 오디오 정본 — book_audio 행. 업로드된 오브젝트 키를 그대로 쓴다(추측 조립 금지,
  // audio-manifest.ts:23-30). duration_ms는 마지막 단어 상한 계산에 쓴다.
  const { data, error } = await supabase
    .from('book_audio')
    .select('page_index, audio_path, marks_path, duration_ms')
    .eq('book_id', bookId)
    .eq('voice', voice)
    .eq('kind', READER_AUDIO_KIND)
    .returns<AudioRow[]>();

  if (error) {
    throw new Error(`resolveWordAudioClips: book_audio 조회 실패 — ${error.message}`);
  }

  const audioByPage = new Map((data ?? []).map((row) => [row.page_index, row] as const));

  /** pageIndex → marks. null = 받기 실패(재시도하지 않는다). */
  const marksCache = new Map<number, WordMark[] | null>();

  async function loadMarks(row: AudioRow): Promise<WordMark[] | null> {
    const cached = marksCache.get(row.page_index);
    if (cached !== undefined) return cached;

    let marks: WordMark[] | null = null;
    try {
      const res = await doFetch(`${audioBase}/${row.marks_path}`);
      if (res.ok) {
        marks = parseMarks(await res.text());
      }
    } catch {
      marks = null;
    }
    marksCache.set(row.page_index, marks);
    return marks;
  }

  const clips: WordAudioClip[] = [];

  for (const candidate of candidates) {
    let clip: WordAudioClip | null = null;
    // 가장 "약한" 실패 사유를 기억해 둔다 — 모든 등장이 실패했을 때 보고용.
    let lastFailure: WordAudioFailure = 'no-audio-row';

    for (const occurrence of candidate.occurrences) {
      const row = audioByPage.get(occurrence.pageIndex);
      if (!row) {
        lastFailure = 'no-audio-row';
        continue;
      }
      if (!row.marks_path) {
        lastFailure = 'no-marks-path';
        continue;
      }

      const marks = await loadMarks(row);
      if (!marks) {
        lastFailure = 'marks-fetch-failed';
        continue;
      }

      // 이 페이지에서 같은 단어에 해당하는 mark들.
      const matchIndexes: number[] = [];
      for (let i = 0; i < marks.length; i++) {
        if (normalizeWord(marks[i].value) === candidate.word) {
          matchIndexes.push(i);
        }
      }
      if (matchIndexes.length === 0) {
        lastFailure = 'word-not-matched';
        continue;
      }

      // 페이지 내 등장 순번(ordinal)에 대응하는 mark를 고른다. 토큰과 mark의 개수가
      // 어긋나면(구두점 처리 차이 등) 첫 매칭으로 접는다 — 발음은 같기 때문이다.
      const markIndex = matchIndexes[occurrence.ordinal] ?? matchIndexes[0];
      const mark = marks[markIndex];
      const next = marks[markIndex + 1];

      // 끝 시각: 다음 mark가 있으면 그 시작. 없으면(= 페이지 마지막 단어, ADR-0065 Q3)
      // 오디오 전체 길이와 start + LAST_WORD_MAX_MS 중 **이른 쪽**.
      const rawEnd = next
        ? next.time
        : Math.min(
            row.duration_ms ?? mark.time + LAST_WORD_MAX_MS,
            mark.time + LAST_WORD_MAX_MS,
          );

      // 여유 적용(위 LEAD_IN_MS 주석의 근거). 파일 경계를 넘지 않도록 마지막에 클램프한다.
      const startMs = Math.max(0, mark.time - LEAD_IN_MS);
      const withTail = Math.max(rawEnd + TAIL_MS, startMs + MIN_CLIP_MS);
      const endMs = row.duration_ms ? Math.min(withTail, row.duration_ms) : withTail;

      clip = {
        word: candidate.word,
        playable: true,
        pageIndex: occurrence.pageIndex,
        audioUrl: `${audioBase}/${row.audio_path}`,
        startMs,
        endMs,
        failure: null,
      };
      break;
    }

    clips.push(
      clip ?? {
        word: candidate.word,
        playable: false,
        pageIndex: null,
        audioUrl: null,
        startMs: null,
        endMs: null,
        failure: lastFailure,
      },
    );
  }

  return clips;
}
