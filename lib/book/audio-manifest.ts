import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * 오디오 리더(Phase D) 데이터 조립 (ADR-0052 D4·D5).
 *
 * 페이지별 {이미지, 자막 텍스트, 오디오 URL, marks URL}을 만들어 AudioReader에 넘긴다.
 * 이미지·텍스트 출처는 검수 화면과 동일하다(불일치 방지, ADR-0052 D4):
 *   - 텍스트 = book_text.text (0-based page_index)
 *   - 이미지 = book-images/book_dash-{slug}/{NN}.jpg  (NN = page_index+1, 2자리)
 *   - 오디오 = {audioBase}/book_dash-{slug}/p{page_index}.mp3 (+ .marks.json)  (ADR-0034 pNN)
 *
 * slug = books.source_id (검수 코호트 조인 근거, ADR-0047 D1 / lib/admin/review/query.ts 박제).
 *
 * is_active 가드 0건 — service role 직접 조회. 공개 노출 가드는 호출 route(Phase F) 책임.
 * 본 모듈은 SELECT 전용.
 */

const IMAGE_STORAGE_PREFIX = 'storage/v1/object/public/book-images';
const AUDIO_STORAGE_PREFIX = 'storage/v1/object/public/book-audio';

/** page = page_index + 1 (= 이미지 NN). mp3/marks 키는 pNN(NN = page_index). */
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

export interface ReaderAudioBook {
  bookId: string;
  slug: string;
  title: string;
  pages: ReaderAudioPage[];
}

interface BuildOptions {
  /**
   * 오디오 base URL. 미지정 시 env NEXT_PUBLIC_TTS_AUDIO_BASE, 그것도 없으면
   * Supabase book-audio 공개 버킷. 로컬 개발은 '/tts-dev'로 주입(업로드 전 로컬 재생).
   * base 뒤 경로(/book_dash-{slug}/pNN.*)는 dev·prod 동일 → base만 교체하면 전환.
   */
  audioBase?: string;
}

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
    .select('id, title, source_id')
    .eq('id', bookId)
    .maybeSingle<{ id: string; title: string; source_id: string }>();

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

  const slug = book.source_id;
  const imageBase = requireSupabaseUrl();
  const audioBase = resolveAudioBase(opts);

  const pages: ReaderAudioPage[] = (textRows ?? []).map((row) => {
    const pageIndex = row.page_index;
    const page = pageIndex + 1;
    const nn = String(page).padStart(2, '0');
    const pnn = String(pageIndex).padStart(2, '0');
    // 생성 시 정본과 동일하게 trim(브리지가 strip한 텍스트로 TTS를 만들었으므로 오프셋 정합).
    const text = (row.text ?? '').trim();
    const hasAudio = text.length > 0;
    return {
      pageIndex,
      page,
      imageUrl: `${imageBase}/${IMAGE_STORAGE_PREFIX}/book_dash-${slug}/${nn}.jpg`,
      text,
      audioUrl: hasAudio ? `${audioBase}/book_dash-${slug}/p${pnn}.mp3` : null,
      marksUrl: hasAudio ? `${audioBase}/book_dash-${slug}/p${pnn}.marks.json` : null,
    };
  });

  return { bookId: book.id, slug, title: book.title, pages };
}
