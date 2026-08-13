import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * 오디오 리더(Phase D) 데이터 조립 (ADR-0052 D4·D5).
 *
 * 페이지별 {이미지, 자막 텍스트, 오디오 URL, marks URL}을 만들어 AudioReader에 넘긴다.
 * 이미지·텍스트 출처는 검수 화면과 동일하다(불일치 방지, ADR-0052 D4 · ADR-0057 D4):
 *   - 텍스트 = book_text.text      (0-based page_index)
 *   - 이미지 = book_text.image_url (같은 행에서 그대로 — 조립 0건, ADR-0057 D2)
 *   - 오디오 = {audioBase}/{book_audio.audio_path} (+ marks_path)
 *
 * ★ 이미지 URL은 **DB 값을 그대로 쓴다**(ADR-0057 D2). 종전에는 코드가
 *   `book-images/book_dash-{source_id}/{NN}.jpg`를 조립했는데, 접두사가 하드코딩이라
 *   ASb·Bloom·GDL에서는 전 면이 조용히 404였다(에러 없이 빈 칸 — ADR-0056 D14 참고·O-d).
 *   실제로 ASb·Bloom 본문 이미지는 book-images 버킷에 객체가 없고 외부 CDN에 있으므로
 *   접두사 분기로는 해결되지 않는다. 이제 적재 시점에 완성된 절대 URL을 넣어 두고
 *   런타임은 그 값을 읽기만 한다 — 플랫폼 분기 0건.
 *   image_url이 NULL인 면은 "이미지 없는 면"이며 오류가 아니다(ADR-0025 Amd#6 A3).
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

const AUDIO_STORAGE_PREFIX = 'storage/v1/object/public/book-audio';

/** page = page_index + 1 (= 신 규약 mp3 키의 NN, ADR-0034 Amd#2). */
export interface ReaderAudioPage {
  /** 0-based (book_text.page_index). */
  pageIndex: number;
  /** = pageIndex + 1. 화면 표시용. */
  page: number;
  /**
   * 검수 화면과 동일 출처의 이미지 URL = book_text.image_url 원본(ADR-0057 D2·D4).
   * null = 이미지 없는 면(정상). 리더는 빈 칸으로 두지 말고 폴백을 그린다(ADR-0057 D3).
   */
  imageUrl: string | null;
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

/** 본문 낭독 트랙 kind. 표지(kind='cover')만 있는 책은 리더 오디오 대상이 아니다. */
export const READER_AUDIO_KIND = 'page';

/**
 * `.in('book_id', …)` 한 번에 넣는 id 최대 개수.
 *
 * PostgREST는 필터를 URL 쿼리스트링으로 실어 보낸다. UUID 1개가 약 37바이트라 id가
 * 수천 개면 URL이 수십 KB로 불어나 요청이 거부된다(414). 시연 페이지
 * (/showcase/[source])가 한 출처 전량(ASb 약 2,160권)을 한 번에 넘기므로 상한이 필요하다.
 * 300개면 URL이 약 11KB로 안전하고, 일반 목록(카드 24·admin 24·상세 1)은 여전히 쿼리 1회다.
 */
const AUDIO_LOOKUP_CHUNK = 300;

/**
 * 「이 책에 재생 가능한 낭독이 있는가」 판정의 **단일 출처**.
 *
 * 조건 = book_audio에 (kind=READER_AUDIO_KIND AND voice=DEFAULT_READER_VOICE) 행 존재.
 * 이 조건이 여러 표면에 흩어지면 표면마다 답이 갈린다 — 실제로 상세 배지가
 * `books.has_audio` 컬럼을 따로 보다가 구 Ruth 44권에서 「배지는 뜨는데 재생은 안 됨」이
 * 발생했다(2026-07-28 정찰). 그래서 조건 리터럴은 이 함수 안에만 둔다.
 *
 * 현재 호출 표면 4곳:
 *   1. hasReaderAudio(아래)          — /book/[id]/read 오디오 리더 게이트
 *   2. lib/book/detail.ts            — 상세 "듣기 지원" 배지 (카탈로그 캐시 안에서 산출)
 *   3. lib/admin/books/query.ts      — /admin/books 썸네일 오디오 배지
 *   4. lib/landing/popular-books.ts  — toPopularBooks(카드 4표면 공용 통로)
 *
 * @param supabase 호출자가 넘긴 클라이언트. **본 함수는 클라이언트를 만들지 않는다** —
 *   service role(리더·admin)과 쿠키 없는 publishable(카탈로그 캐시, ADR-0033 안전 원칙)을
 *   모두 받기 위해서다. book_audio RLS는 anon/authenticated SELECT 공개읽기라
 *   (ADR-0034 (d)) publishable 클라이언트로도 동일한 답이 나온다.
 * @param bookIds 판정 대상 book id들. 권마다 개별 조회하는 N+1을 쓰지 않는다 —
 *   AUDIO_LOOKUP_CHUNK(300)개씩 묶어 조회하므로 일반 목록은 쿼리 1회로 끝난다.
 * @returns 낭독이 있는 book id 집합. 조회 실패 시 빈 Set — 배지·오디오 UI가 안 뜰 뿐
 *   책 자체는 기존 경로로 정상 노출된다(가용성 우선, 기존 폴백 동작 유지).
 *   청크 하나만 실패해도 전체를 빈 Set으로 접는다(부분 결과로 「어떤 책만 배지가 빠지는」
 *   설명 불가능한 상태를 만들지 않는다).
 */
export async function selectReaderAudioBookIds(
  supabase: SupabaseClient,
  bookIds: string[],
  voice: string = DEFAULT_READER_VOICE,
): Promise<Set<string>> {
  if (bookIds.length === 0) {
    return new Set();
  }

  const found = new Set<string>();

  for (let start = 0; start < bookIds.length; start += AUDIO_LOOKUP_CHUNK) {
    const chunk = bookIds.slice(start, start + AUDIO_LOOKUP_CHUNK);

    const { data, error } = await supabase
      .from('book_audio')
      .select('book_id')
      .in('book_id', chunk)
      .eq('kind', READER_AUDIO_KIND)
      .eq('voice', voice)
      .returns<{ book_id: string }[]>();

    if (error) {
      return new Set();
    }

    for (const row of data ?? []) {
      found.add(row.book_id);
    }
  }

  return found;
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
 * 오디오 리더 게이트 — 해당 책에 재생 가능한 오디오가 있는지만 확인한다.
 *
 * 판정은 selectReaderAudioBookIds(단일 출처)에 위임한다. 조건 리터럴(kind·voice)을
 * 여기서 다시 쓰지 않는 이유는 그 함수 주석 참조. 행이 0이면 호출자는 기존 뷰어 경로를
 * 그대로 탄다(회귀 0). 조회 실패도 동일하게 false로 접힌다.
 *
 * count(head:true) → book_id SELECT로 바뀌었다. 대상이 1권이라 최대 십수 행이고,
 * 판정 결과는 동일하다(행 존재 여부만 본다).
 */
export async function hasReaderAudio(
  bookId: string,
  voice: string = DEFAULT_READER_VOICE,
): Promise<boolean> {
  const audioBookIds = await selectReaderAudioBookIds(
    createServiceRoleClient(),
    [bookId],
    voice,
  );
  return audioBookIds.has(bookId);
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
    .select('page_index, text, image_url')
    .eq('book_id', bookId)
    .order('page_index', { ascending: true })
    .returns<
      { page_index: number; text: string | null; image_url: string | null }[]
    >();

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

  // slug는 이미지 조립용이 아니라 ReaderAudioBook.slug 반환값이다(아래 return).
  const slug = book.source_id;
  const audioBase = resolveAudioBase(opts);

  const pages: ReaderAudioPage[] = (textRows ?? []).map((row) => {
    const pageIndex = row.page_index;
    const page = pageIndex + 1;
    // 생성 시 정본과 동일하게 trim(브리지가 strip한 텍스트로 TTS를 만들었으므로 오프셋 정합).
    const text = (row.text ?? '').trim();
    const audio = audioByPageIndex.get(pageIndex);
    return {
      pageIndex,
      page,
      // DB 값 그대로 — 조립·가공 0건(ADR-0057 D2). NULL은 NULL로 전달한다.
      imageUrl: row.image_url,
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
