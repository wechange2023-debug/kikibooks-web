import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * 오디오 리더(Phase D) 데이터 조립 (ADR-0052 D4·D5).
 *
 * 페이지별 {이미지, 자막 텍스트, 오디오 URL, marks URL}을 만들어 AudioReader에 넘긴다.
 * 이미지·텍스트 출처는 검수 화면과 동일하다(불일치 방지, ADR-0052 D4):
 *   - 텍스트 = book_text.text (0-based page_index)
 *   - 이미지 = book-images/book_dash-{slug}/{NN}.jpg  (NN = page_index+1, 2자리)
 *   - 오디오 = {audioBase}/{book_audio.audio_path} (+ marks_path)
 *
 * ★ 오디오 경로는 **book_audio 행을 정본으로 읽는다**(추측 조립 금지).
 *   근거: 키 규약이 ADR-0034 Amendment #2로 개정돼(성우 층위 + 1-based pNN) 구·신 배치가
 *   공존한다. 규약을 코드에서 재조립하면 배치마다 분기가 생기고, 텍스트가 사후 수정되면
 *   "텍스트 유무"로 오디오 존재를 추정하던 기존 방식이 실제 파일과 어긋난다.
 *   DB 행이 곧 업로드된 오브젝트이므로 행을 그대로 쓰는 것이 유일한 진실이다.
 *   (신 규약 예: book_dash-{slug}/danielle/p01.mp3 — voice 층위, NN = page_index+1)
 *
 * slug = books.source_id (검수 코호트 조인 근거, ADR-0047 D1 / lib/admin/review/query.ts 박제).
 *
 * is_active 가드 0건 — service role 직접 조회. 공개 노출 가드는 호출 route(Phase F) 책임.
 * 본 모듈은 SELECT 전용.
 */

const IMAGE_STORAGE_PREFIX = 'storage/v1/object/public/book-images';
const AUDIO_STORAGE_PREFIX = 'storage/v1/object/public/book-audio';

/** page = page_index + 1 (= 이미지 NN = 신 규약 mp3 키의 NN, ADR-0034 Amd#2). */
export interface ReaderAudioPage {
  /** 0-based (book_text.page_index). */
  pageIndex: number;
  /** = pageIndex + 1. 이미지 NN·화면 표시용. */
  page: number;
  /** 검수 화면과 동일 canonical 이미지 URL. */
  imageUrl: string;
  /** 자막 텍스트(빈 면은 ''). */
  text: string;
  /** 오디오 mp3 공개 URL. 빈 텍스트 면은 null(음성 없음). */
  audioUrl: string | null;
  /** word speech-marks JSON URL. 빈 텍스트 면은 null. */
  marksUrl: string | null;
}

/**
 * 표지 트랙 (ADR-0034 Amendment #1 — book_audio.kind='cover', page_index=0 placeholder).
 *
 * 본문 면과 출처가 다르다: 이미지는 books.cover_url(book-covers 버킷),
 * 텍스트는 books.title. Book Dash는 표지가 별도 images/cover.jpg이며 본문 01.jpg와
 * 구분된다(ADR-0036 §1) — 즉 표지는 book_text에 행이 없다.
 *
 * 표지 오디오가 없는 책(구 44권·향후 타 코호트)은 null → 리더가 본문부터 시작(회귀 0).
 */
export interface ReaderAudioCover {
  /** books.cover_url 원본 그대로(외부 URL·Storage URL 모두 가능). */
  imageUrl: string;
  /** 낭독·하이라이트 대상 = books.title. marks 오프셋의 기준 문자열. */
  text: string;
  audioUrl: string;
  marksUrl: string | null;
}

export interface ReaderAudioBook {
  bookId: string;
  slug: string;
  title: string;
  /** 조립에 사용한 성우(= book_audio.voice = Storage 성우 폴더명). */
  voice: string;
  /** audioUrl이 있는 면 수. 0이면 오디오 리더를 띄우지 않는다(호출 route 게이트). */
  audioPageCount: number;
  /** 표지 트랙. 없으면 null(리더가 본문 1면부터 시작). */
  cover: ReaderAudioCover | null;
  pages: ReaderAudioPage[];
}

interface BuildOptions {
  /**
   * 오디오 base URL. 미지정 시 env NEXT_PUBLIC_TTS_AUDIO_BASE, 그것도 없으면
   * Supabase book-audio 공개 버킷. base 뒤에 book_audio.audio_path를 그대로 잇는다.
   *
   * 로컬 오디오 주입(public/tts-dev)·임시 dev-audio 라우트는 **삭제됐다**(2026-07-22).
   * Storage 업로드 완료로 dev·prod 모두 공개 URL을 쓴다. 본 옵션은 향후 다른 base가
   * 필요할 때를 위한 확장점으로만 남긴다 — 현재 호출자는 전부 기본값을 쓴다.
   */
  audioBase?: string;
  /** book_audio.voice 필터. 기본 'danielle'(ADR-0052 Amendment #2 확정 보이스). */
  voice?: string;
}

/** ADR-0052 Amendment #2 확정 보이스. Storage 성우 폴더명과 동일한 소문자. */
export const DEFAULT_READER_VOICE = 'danielle';

function requireSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error('audio-manifest: NEXT_PUBLIC_SUPABASE_URL 미설정');
  }
  return url.replace(/\/+$/, '');
}

function resolveAudioBase(opts: BuildOptions | undefined): string {
  const base =
    opts?.audioBase ??
    process.env.NEXT_PUBLIC_TTS_AUDIO_BASE ??
    `${requireSupabaseUrl()}/${AUDIO_STORAGE_PREFIX}`;
  return base.replace(/\/+$/, '');
}

/**
 * 오디오 리더 게이트 — 해당 책에 재생 가능한 오디오가 있는지만 확인한다.
 *
 * 읽기 라우트가 **모든 책**에서 호출하므로 count 전용(head: true)으로 유지한다.
 * 행이 0이면 호출자는 기존 뷰어 경로를 그대로 탄다(회귀 0).
 */
export async function hasReaderAudio(
  bookId: string,
  voice: string = DEFAULT_READER_VOICE,
): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { count, error } = await supabase
    .from('book_audio')
    .select('id', { count: 'exact', head: true })
    .eq('book_id', bookId)
    .eq('kind', 'page')
    .eq('voice', voice);

  // 조회 실패 시 false — 오디오 UI를 띄우지 않고 기존 뷰어로 폴백한다(읽기 흐름 보존).
  if (error) {
    return false;
  }
  return (count ?? 0) > 0;
}

/**
 * 오디오 리더용 책 데이터 조립.
 * @returns books 행이 없으면 null. book_text 0행이어도 pages: []로 반환(빈 책 노출).
 */
export async function getAudioReaderBook(
  bookId: string,
  opts?: BuildOptions,
): Promise<ReaderAudioBook | null> {
  const supabase = createServiceRoleClient();

  const { data: book, error: bookError } = await supabase
    .from('books')
    .select('id, title, source_id, cover_url')
    .eq('id', bookId)
    .maybeSingle<{
      id: string;
      title: string;
      source_id: string;
      cover_url: string | null;
    }>();

  if (bookError) {
    throw new Error(`getAudioReaderBook: books 조회 실패 — ${bookError.message}`);
  }
  if (!book) {
    return null;
  }

  const { data: textRows, error: textError } = await supabase
    .from('book_text')
    .select('page_index, text')
    .eq('book_id', bookId)
    .order('page_index', { ascending: true })
    .returns<{ page_index: number; text: string | null }[]>();

  if (textError) {
    throw new Error(`getAudioReaderBook: book_text 조회 실패 — ${textError.message}`);
  }

  const voice = opts?.voice ?? DEFAULT_READER_VOICE;

  // 오디오 정본 — book_audio 행. 업로드된 오브젝트 키를 그대로 쓴다(추측 조립 금지).
  const { data: audioRows, error: audioError } = await supabase
    .from('book_audio')
    .select('kind, page_index, audio_path, marks_path')
    .eq('book_id', bookId)
    .eq('voice', voice)
    .returns<
      {
        kind: string;
        page_index: number;
        audio_path: string;
        marks_path: string | null;
      }[]
    >();

  if (audioError) {
    throw new Error(`getAudioReaderBook: book_audio 조회 실패 — ${audioError.message}`);
  }

  const audioByPageIndex = new Map(
    (audioRows ?? [])
      .filter((row) => row.kind === 'page')
      .map((row) => [row.page_index, row] as const),
  );
  // 표지 행은 kind로만 식별한다. page_index=0은 placeholder이므로 본문 첫 면과
  // 구분되지 않는다(UNIQUE가 kind를 포함하는 이유 — ADR-0034 Amd#1).
  const coverRow = (audioRows ?? []).find((row) => row.kind === 'cover') ?? null;

  const slug = book.source_id;
  const imageBase = requireSupabaseUrl();
  const audioBase = resolveAudioBase(opts);

  const pages: ReaderAudioPage[] = (textRows ?? []).map((row) => {
    const pageIndex = row.page_index;
    const page = pageIndex + 1;
    const nn = String(page).padStart(2, '0');
    // 생성 시 정본과 동일하게 trim(브리지가 strip한 텍스트로 TTS를 만들었으므로 오프셋 정합).
    const text = (row.text ?? '').trim();
    const audio = audioByPageIndex.get(pageIndex);
    return {
      pageIndex,
      page,
      imageUrl: `${imageBase}/${IMAGE_STORAGE_PREFIX}/book_dash-${slug}/${nn}.jpg`,
      text,
      audioUrl: audio ? `${audioBase}/${audio.audio_path}` : null,
      marksUrl: audio?.marks_path ? `${audioBase}/${audio.marks_path}` : null,
    };
  });

  // 표지 트랙 — 오디오 행과 cover_url이 모두 있을 때만. 하나라도 없으면 본문부터 시작.
  const cover: ReaderAudioCover | null =
    coverRow && book.cover_url
      ? {
          imageUrl: book.cover_url,
          text: book.title,
          audioUrl: `${audioBase}/${coverRow.audio_path}`,
          marksUrl: coverRow.marks_path ? `${audioBase}/${coverRow.marks_path}` : null,
        }
      : null;

  return {
    bookId: book.id,
    slug,
    title: book.title,
    voice,
    audioPageCount: pages.filter((p) => p.audioUrl !== null).length,
    cover,
    pages,
  };
}
