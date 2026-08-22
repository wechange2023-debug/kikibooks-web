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
 * `book_audio` 조회 1회가 받아오는 최대 행수 — PostgREST 기본 max-rows(1000)와 정합.
 *
 * AUDIO_LOOKUP_CHUNK가 막는 것은 **요청 URL 길이**(414)뿐이고 **응답 행수**는 막지 못한다.
 * book_audio는 책 1권당 페이지 수만큼 행이 있어(kind='page'), 300권을 한 번에 물으면
 * 수천 행이 되어 이 상한에서 조용히 잘린다. 그래서 청크마다 .range() 루프가 필요하다.
 */
const AUDIO_ROW_PAGE = 1000;

/**
 * 「이 책에 재생 가능한 낭독이 있는가」 판정의 **단일 출처**.
 *
 * 조건 = book_audio에 (kind=READER_AUDIO_KIND AND voice=DEFAULT_READER_VOICE) 행 존재.
 * 이 조건이 여러 표면에 흩어지면 표면마다 답이 갈린다 — 실제로 상세 배지가
 * `books.has_audio` 컬럼을 따로 보다가 구 Ruth 44권에서 「배지는 뜨는데 재생은 안 됨」이
 * 발생했다(2026-07-28 정찰). 그래서 조건 리터럴은 이 함수 안에만 둔다.
 *
 * 현재 호출 표면 3곳:
 *   1. lib/book/detail.ts            — 상세 "듣기 지원" 배지 (카탈로그 캐시 안에서 산출).
 *                                      ADR-0067 D1(a) 이후 리더 게이트도 이 값(Book.hasAudio)을 본다
 *   2. lib/admin/books/query.ts      — /admin/books 썸네일 오디오 배지
 *   3. lib/landing/popular-books.ts  — toPopularBooks(카드 4표면 공용 통로)
 *
 * @param supabase 호출자가 넘긴 클라이언트. **본 함수는 클라이언트를 만들지 않는다** —
 *   service role(리더·admin)과 쿠키 없는 publishable(카탈로그 캐시, ADR-0033 안전 원칙)을
 *   모두 받기 위해서다. book_audio RLS는 anon/authenticated SELECT 공개읽기라
 *   (ADR-0034 (d)) publishable 클라이언트로도 동일한 답이 나온다.
 * @param bookIds 판정 대상 book id들. 권마다 개별 조회하는 N+1을 쓰지 않는다 —
 *   AUDIO_LOOKUP_CHUNK(300)개씩 묶고, 청크마다 AUDIO_ROW_PAGE(1000)행씩 .range()로
 *   끝까지 읽는다. 일반 목록(카드 24·admin 24·상세 1)은 여전히 쿼리 1회로 끝난다.
 * @returns 낭독이 있는 book id 집합. 조회 실패 시 빈 Set — 배지·오디오 UI가 안 뜰 뿐
 *   책 자체는 기존 경로로 정상 노출된다(가용성 우선, 기존 폴백 동작 유지).
 *   청크 하나만 실패해도 전체를 빈 Set으로 접는다(부분 결과로 「어떤 책만 배지가 빠지는」
 *   설명 불가능한 상태를 만들지 않는다).
 *
 *   ★ 종전에는 이 방어가 겨냥한 상태가 방어를 우회해 실제로 발생했다. 행 페이지네이션이
 *   없어 PostgREST 기본 1000행 cap에 걸리면, 그 응답은 error가 아니라 **정상 200**이라
 *   위 `if (error)` 폴백이 발동하지 않은 채 잘린 결과가 그대로 통과했다. 쇼케이스처럼
 *   한 출처 전량을 넘기는 표면에서 「책 절반만 배지가 빠지는」 증상으로 나타났다
 *   (Book Dash 190권 중 86권, ASb 527권 중 195권만 판정 — 2026-08-20 실측).
 *   .range() 루프로 청크를 끝까지 읽어 해소했다.
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

    // 청크 하나가 1000행을 넘길 수 있다(책 1권당 페이지 수만큼 행). 반환이 한 페이지
    // 미만이 될 때까지 .range()로 끝까지 읽는다 — 잘린 결과를 정답으로 오인하지 않기 위해.
    for (let offset = 0; ; offset += AUDIO_ROW_PAGE) {
      const { data, error } = await supabase
        .from('book_audio')
        .select('book_id')
        .in('book_id', chunk)
        .eq('kind', READER_AUDIO_KIND)
        .eq('voice', voice)
        .order('book_id', { ascending: true })
        .range(offset, offset + AUDIO_ROW_PAGE - 1)
        .returns<{ book_id: string }[]>();

      if (error) {
        return new Set();
      }

      const rows = data ?? [];
      for (const row of rows) {
        found.add(row.book_id);
      }

      if (rows.length < AUDIO_ROW_PAGE) {
        break;
      }
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

/**
 * 오디오 base URL 해소 — **Storage 접두사의 단일 출처**.
 *
 * ★ export 이유(E-2b): 단어카드 발음 재생(lib/wordplay/word-audio.ts)이 같은 버킷을
 *   읽어야 하는데, 접두사를 그쪽에 복제하면 리터럴이 두 곳이 된다. 하드코딩된 Storage
 *   접두사는 과거 ASb·Bloom·GDL 본문 이미지 전 면을 조용히 404로 만든 전력이 있다
 *   (본 파일 :15-21). 그래서 해소 로직을 여기 하나로 두고 호출자가 가져다 쓴다.
 *   동작·기본값은 종전과 동일하다(회귀 0 — 시그니처만 넓혔다).
 *
 * @param opts 미지정 시 env NEXT_PUBLIC_TTS_AUDIO_BASE → Supabase 공개 버킷 순.
 */
export function resolveAudioBase(opts?: { audioBase?: string }): string {
  const base =
    opts?.audioBase ??
    process.env.NEXT_PUBLIC_TTS_AUDIO_BASE ??
    `${requireSupabaseUrl()}/${AUDIO_STORAGE_PREFIX}`;
  return base.replace(/\/+$/, '');
}

/**
 * ADR-0067 D1(a) — `hasReaderAudio()`는 삭제됐다.
 *
 * 유일한 호출자였던 `read/page.tsx`가 이제 `Book.hasAudio`(lib/book/detail.ts:99)를 본다.
 * 그 값도 **같은 `selectReaderAudioBookIds`·같은 기본 voice**로 산출되므로 판정이 같고
 * (detail.ts:170·:249), 게이트 전용 `book_audio` 왕복 1회가 사라진다.
 * 판정 단일 출처는 여전히 `selectReaderAudioBookIds`다 — 그 함수는 무변경이다.
 */

/**
 * `getAudioReaderBook`이 필요로 하는 책 정보 (ADR-0067 D1(b)).
 *
 * 종전에는 함수가 `books`를 **직접 한 번 더** 읽었다. 그런데 호출자(`read/page.tsx`)는 그 시점에
 * 이미 `getBookByIdIncludingInactive`로 같은 행을 손에 들고 있고, 여기서 쓰는 컬럼은 넷뿐이라
 * 전부 그 안에 들어 있다(lib/book/detail.ts:146-148). 그래서 조회 대신 **인자로 받는다.**
 * `Book` 전체가 아니라 필요한 넷만 받는 이유: 이 모듈이 `Book` 타입에 묶이지 않게 하기 위함이다.
 */
export interface ReaderAudioBookInput {
  id: string;
  title: string;
  source_id: string;
  cover_url: string | null;
}

/**
 * 오디오 리더용 책 데이터 조립.
 *
 * ADR-0067 D1(b)·D2 — `books` 조회를 걷어내고(인자로 대체), 남은 `book_text`·`book_audio`를
 * **병렬로** 돌린다. 둘은 `book_id`(와 `voice`)만 걸고 서로의 결과를 쓰지 않는다 —
 * 결합은 조회가 끝난 뒤 `pages`·`cover` 조립에서만 일어난다. 함수 내부 왕복 3단 → 1단.
 *
 * @returns 항상 객체다. 종전의 `null`은 "books 행 없음"이었는데, 이제 호출자가 책을 넘기므로
 *   그 경우가 성립하지 않는다. book_text 0행이어도 `pages: []`로 반환한다(빈 책 노출).
 */
export async function getAudioReaderBook(
  book: ReaderAudioBookInput,
  opts?: BuildOptions,
): Promise<ReaderAudioBook> {
  const supabase = createServiceRoleClient();
  const bookId = book.id;
  const voice = opts?.voice ?? DEFAULT_READER_VOICE;

  // ADR-0067 D2 — 상호 참조 0건임을 본문 전량으로 확인하고 병렬화했다.
  // 오디오 정본은 book_audio 행이다. 업로드된 오브젝트 키를 그대로 쓴다(추측 조립 금지).
  const [
    { data: textRows, error: textError },
    { data: audioRows, error: audioError },
  ] = await Promise.all([
    supabase
      .from('book_text')
      .select('page_index, text, image_url')
      .eq('book_id', bookId)
      .order('page_index', { ascending: true })
      .returns<
        { page_index: number; text: string | null; image_url: string | null }[]
      >(),
    supabase
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
      >(),
  ]);

  if (textError) {
    throw new Error(`getAudioReaderBook: book_text 조회 실패 — ${textError.message}`);
  }
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
