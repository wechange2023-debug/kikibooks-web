import 'server-only';

import { unstable_cache } from 'next/cache';
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from '@supabase/supabase-js';

import { selectReaderAudioBookIds } from '@/lib/book/audio-manifest';

/**
 * 책 상세 페이지 데이터 fetch — books.id UUID 단일 조회.
 *
 * ADR-0016 결정 1·2·3 데이터 공급원:
 *   본 함수는 AttributionBox 5요소(출처·글·그림·출판사·라이선스·원본)와
 *   BookCoverHero(표지·H1 제목·메타 칩) 렌더에 필요한 모든 컬럼을 한 번에
 *   조회한다. illustrator(결정 1-가 NULL 행 생략)·author(결정 2-나 GDL 분기
 *   판별)·source_platform(결정 2-나 분기 키)·attribution_text(license-rules
 *   §4.2 표준 포맷)이 모두 SELECT에 포함된다.
 *
 * RLS 근거:
 *   - 001 §9.x books RLS 정책 "books are viewable by everyone" (USING(true))
 *   - 비로그인 방문자 publishable 세션에서도 조회 가능하나, 본 함수는
 *     보호 라우트(/book/[id])에서만 호출되므로 사실상 인증 사용자만 도달
 *   - is_active=false 책은 명시 필터로 제외 (운영자가 비활성화한 책 보호)
 *
 * 호출자 책임 (호출 측에서 처리):
 *   - null 반환 시 next/navigation.notFound() 호출 (app/book/[id]/page.tsx)
 *   - ADR-0014 Amendment #4 블랙리스트 4 UUID 차단 (book.source_platform +
 *     book.source_id 매칭 후 notFound) — 본 함수는 블랙리스트를 모른다.
 *     사유: detail.ts는 단순 조회 단일 책임. 표면별 차단 정책은 호출 측 분기.
 *
 * 사용자 흐름: docs/intent/screen-03-book-detail.md §4
 */

/** 책 상세 페이지에 필요한 books 행 — AttributionBox 5요소 + 표지·메타 컬럼 전부. */
export interface Book {
  id: string;
  title: string;
  /** Book Dash는 실제 글쓴이, GDL은 publisher 값 (ADR-0016 결정 2-나 분기 키). */
  author: string | null;
  /** 활성 책 896/896 = 100% NULL (ADR-0013 §7, ADR-0016 결정 1-가 행 생략). */
  illustrator: string | null;
  cover_url: string;
  /** 책 본문 뷰어 iframe src. NOT NULL — 001 §books line 75 `content_url TEXT NOT NULL`. */
  content_url: string;
  /**
   * 뷰어 분기 키 (ADR-0017 D1). NOT NULL — 001 §books line 76~77 CHECK 제약.
   *   - 실데이터 (2026-05-22 측정): 활성 896권 전부 'html' → iframe 단일 경로로 수렴
   *   - epub·h5p·pdf는 ADR-0017 D2 분기 골격만 (실데이터 0건, 미구현 안내)
   */
  content_type: 'html' | 'epub' | 'h5p' | 'pdf' | 'asb_native';
  original_url: string;
  license: string;
  /** Hard Rule 1 — NOT NULL 제약. license-rules.md §4.2 표준 포맷. */
  attribution_text: string;
  /** 'book_dash' | 'gdl' — ADR-0016 결정 2-나 분기 키 + ADR-0014 Amendment #4 차단 판별. */
  source_platform: string;
  /**
   * 외부 플랫폼의 원본 식별자. NOT NULL.
   *   - DB 제약: 001 §books line 71 `source_id TEXT NOT NULL`
   *   - 실데이터 (2026-05-21 측정): 활성 896권/전체 896권 모두 NULL 0건
   *   - ADR-0014 Amendment #4 블랙리스트 UUID 비교 키 (book_dash UUID, gdl 정수문자열 혼재)
   */
  source_id: string;
  /**
   * 자녀 추천 레벨 1~5. 실데이터 NULL 54건(Book Dash 54권 전부 = 활성 6%).
   *   - DB 제약: 001 §books line 80 `level INT CHECK (level BETWEEN 1 AND 5)` — NOT NULL 미선언
   *   - 실데이터 (2026-05-21 측정): 활성 54건 NULL (Book Dash 100% NULL, GDL 0% NULL)
   *   - BookMeta·LevelSelector·추천 폴백 사다리는 NULL 안전 분기 의무
   */
  level: number | null;
  /** 연령 하한. Book Dash 54권 NULL (level과 동일 분포). */
  age_min: number | null;
  /** 연령 상한. Book Dash 54권 NULL. */
  age_max: number | null;
  /**
   * 언어 코드. NOT NULL DEFAULT 'en'.
   *   - DB 제약: 001 §books line 79 `language TEXT NOT NULL DEFAULT 'en'`
   *   - 실데이터 (2026-05-21 측정): 활성 896권 distinct = {'en'} (베타 영어 단일, ADR-0006)
   */
  language: string;
  is_active: boolean;
  /**
   * 오디오(TTS 낭독) 지원 여부 — 상세 "듣기 지원" 배지 표시 신호.
   *
   * ★ books 컬럼이 아니다(camelCase로 구분). `books.has_audio` 컬럼 대신
   *   selectReaderAudioBookIds(lib/book/audio-manifest.ts)로 산출한다 — 즉 배지 조건과
   *   리더 오디오 게이트 조건이 **같은 함수 한 곳**에서 나온다.
   *
   * 종전에는 `books.has_audio` 컬럼을 그대로 실었다(진실 원천 분리 = 표시는 컬럼,
   * 게이팅은 book_audio). 그 결과 구 Ruth 44권(voice='Ruth')에서 컬럼은 true인데
   * 리더 게이트(voice='danielle')는 false라 「배지는 뜨는데 재생이 안 되는」 상태가
   * 생겼다(2026-07-28 정찰). 표시와 실제 재생 가능 여부를 한 기준으로 통일한다.
   *
   * `books.has_audio` 컬럼 자체는 건드리지 않는다 — 본 경로에서 참조만 끊었다.
   * 컬럼 정리는 별도 트랙(카드 표면 3곳이 아직 컬럼을 읽는다 — 아래 주석 참조).
   */
  hasAudio: boolean;
}

/** books SELECT 결과 그대로 — Book에서 파생 필드(hasAudio)만 뺀 형태. */
type BookRow = Omit<Book, 'hasAudio'>;

/**
 * 카탈로그 캐시 전용 — 쿠키 없는 publishable 클라이언트 (ADR-0033 P0-1 안전 원칙).
 *
 * unstable_cache 내부는 요청 스코프 동적 API(cookies())를 쓸 수 없어 세션 클라이언트
 * (lib/supabase/server.ts createClient)를 쓰지 못한다. books RLS는 §9.1 USING(true) 공개라
 * 세션 없이도 활성 책을 조회할 수 있으므로, 세션 없는 publishable 클라이언트를 생성한다.
 *   - publishable 키만 사용 — secret 키 아님(RLS 우회 아님, Hard Rule 6 무위반).
 *   - 사용자·자녀 스코프 데이터 접근 경로가 구조적으로 차단된다(개인 데이터 혼입 불가).
 */
function createCatalogClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      'getBookById(cache): Supabase 환경변수 누락 — NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    );
  }

  return createSupabaseClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * getBookById 캐시 코어 (ADR-0033 P0-1 파일럿).
 *
 * Next.js unstable_cache로 공용 카탈로그 조회 결과를 캐시한다.
 *   - 캐시 키: ['getBookById', id] (id는 함수 인자로 키에 포함).
 *   - tag: 'books-catalog' (admin 토글 시 revalidateTag로 즉시 무효화 — ADR-0033 무효화 전략).
 *   - revalidate: 3600초(1시간) — out-of-band sync(GDL 매일·Book Dash 주간)를 결국 반영하는
 *     시간 기반 안전망.
 * 반환 Book은 순수 JSON 직렬화 가능(문자열·숫자·불리언·null)이라 캐시 왕복에도 값 불변.
 */
const getBookByIdCached = unstable_cache(
  async (id: string): Promise<Book | null> => {
    const supabase = createCatalogClient();
    const { data, error } = await supabase
      .from('books')
      .select(
        'id, title, author, illustrator, cover_url, content_url, content_type, original_url, license, attribution_text, source_platform, source_id, level, age_min, age_max, language, is_active',
      )
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle<BookRow>();

    if (error) {
      throw new Error(`getBookById: books 조회 실패 (id=${id}) — ${error.message}`);
    }

    if (!data) {
      return null;
    }

    // "듣기 지원" 배지 판정 — 리더 오디오 게이트와 **같은 함수**를 쓴다(단일 출처).
    //
    // 이 조회는 캐시 함수 **안**에 있다. 즉 캐시 히트 시 요청당 추가 쿼리 0건이고,
    // 미스 시에만 books 조회에 1건이 더 붙는다. 무효화도 기존과 동일하게
    // tag 'books-catalog' 한 경로로 처리된다(admin 캐시 비우기 버튼 포함).
    //
    // 클라이언트는 쿠키 없는 publishable(createCatalogClient) 그대로다 — secret 키를
    // 캐시 경로에 들이지 않는다(ADR-0033 안전 원칙 유지). book_audio RLS가
    // anon/authenticated SELECT 공개읽기(ADR-0034 (d))라 service role 없이도 같은 답이다.
    const audioBookIds = await selectReaderAudioBookIds(supabase, [id]);

    return { ...data, hasAudio: audioBookIds.has(id) };
  },
  // 캐시 키 버전 서픽스 v3 — 페이로드 키가 has_audio(컬럼) → hasAudio(book_audio 산출)로
  // 바뀌었다. 구버전 캐시(v2)가 배포 후 잔존해 옛 판정이 반환되는 것을 막는다.
  // tags·revalidate 정책은 불변(ADR-0033).
  ['getBookById-v3'],
  { tags: ['books-catalog'], revalidate: 3600 },
);

/**
 * books.id로 책 1권을 조회한다. 없거나 is_active=false면 null.
 *
 * 호출 측은 null을 받으면 next/navigation.notFound()를 호출해야 한다 —
 * 본 함수는 throw하지 않고 null 반환만 한다(NULL과 진짜 에러의 명확한 분리).
 * 진짜 DB 에러(네트워크·권한 등)는 throw로 호출 측에 전달된다.
 *
 * ★ ADR-0033 P0-1 파일럿 — 공용 카탈로그 캐싱(getBookByIdCached). 반환 데이터는 캐싱 전과
 *   완전히 동일하다: books RLS §9.1 USING(true)라 세션 유무와 무관하게 같은 행을 반환한다.
 *
 * @param supabase 호출자의 본인 세션 Supabase 클라이언트.
 *   ★캐시 경로에서는 사용하지 않는다 — getBookByIdCached가 쿠키 없는 publishable 클라이언트를
 *   내부 생성해 공용 카탈로그를 조회한다(ADR-0033 안전 원칙: 개인 데이터 혼입 구조적 차단).
 *   인자는 호출부 시그니처 안정성을 위해 유지하며, 향후 getBooks·getCategoryDistribution
 *   이관 시 일괄 정리한다(ADR-0033 롤아웃).
 * @param id       books.id UUID. 형식 검증은 호출 측 책임(잘못된 UUID는 DB가 0행 반환).
 */
export async function getBookById(
  supabase: SupabaseClient,
  id: string,
): Promise<Book | null> {
  void supabase; // 캐시 경로 미사용(ADR-0033) — 시그니처 안정성 위해 인자만 유지.
  return getBookByIdCached(id);
}

/**
 * getBookByIdIncludingInactive 캐시 코어 (ADR-0063 O-D5-5 안 ② 채택).
 *
 * 위 getBookByIdCached와 **단 한 가지만 다르다** — `.eq('is_active', true)`가 없다.
 * 비활성 도서의 상세 데이터(제목·저자·삽화가·라이선스·원본 링크 = CC BY 4.0 어트리뷰션
 * 4요소)를 읽어야 D2 안내 화면이 성립하기 때문이다(ADR-0063 D2 — 어트리뷰션 유지는
 * 법적 의무라 "책 정보를 못 읽으니 생략"이 성립하지 않는다).
 *
 * 나머지는 전부 동일하다:
 *   - 캐시 키: ['getBookById-any-v1'] — 기존 v3와 **다른 키**라 캐시가 섞이지 않는다.
 *   - tag: 'books-catalog' — 기존과 **같은 태그**다. admin의 is_active 토글이 쏘는
 *     revalidateTag(lib/admin/books/actions.ts:98·107) 한 번이 두 캐시를 동시에
 *     무효화한다. 무효화 정책은 ADR-0033 그대로이며 신규 태그 0건이다.
 *   - revalidate: 3600 — 기존과 동일.
 *   - 클라이언트: createCatalogClient(쿠키 없는 publishable). secret 키 0건.
 *     books RLS §9.1 USING(true)라 비활성 행도 세션 없이 읽힌다(RLS 우회 아님).
 *   - SELECT 컬럼·Book 타입 무변경 — is_active가 이미 둘 다에 포함돼 있다(:83·:147).
 *
 * ★ 판정은 호출부 책임이다. 본 함수는 활성/비활성을 **가리지 않고 반환**하므로,
 *   호출부가 `book.is_active === false`를 보고 D2(안내)·D3(redirect)·D5(정상)를 고른다.
 */
const getBookByIdAnyCached = unstable_cache(
  async (id: string): Promise<Book | null> => {
    const supabase = createCatalogClient();
    const { data, error } = await supabase
      .from('books')
      .select(
        'id, title, author, illustrator, cover_url, content_url, content_type, original_url, license, attribution_text, source_platform, source_id, level, age_min, age_max, language, is_active',
      )
      .eq('id', id)
      .maybeSingle<BookRow>();

    if (error) {
      throw new Error(
        `getBookByIdIncludingInactive: books 조회 실패 (id=${id}) — ${error.message}`,
      );
    }

    if (!data) {
      return null;
    }

    // 오디오 판정도 활성 경로와 **같은 함수**를 쓴다(단일 출처 유지, :164 주석과 동일 원칙).
    const audioBookIds = await selectReaderAudioBookIds(supabase, [id]);

    return { ...data, hasAudio: audioBookIds.has(id) };
  },
  ['getBookById-any-v1'],
  { tags: ['books-catalog'], revalidate: 3600 },
);

/**
 * books.id로 책 1권을 조회한다 — **is_active를 가리지 않는다** (ADR-0063 O-D5-5).
 *
 * getBookById와의 차이는 활성 필터 유무 하나뿐이다. 비활성 도서에 안내 화면(D2)·
 * 상세 redirect(D3)·완독 축하 정상 표시(D5)를 제공해야 하는 3개 표면이 본 함수를 쓴다.
 * 나머지 호출부(라이브러리·홈·추천 등)는 계속 getBookById를 쓴다 — 기존 함수는
 * 무변경이므로 회귀 범위가 이 3표면으로 국한된다(O-D5-5 안 ② 채택 근거).
 *
 * 없는 책은 여전히 null이다. 호출 측은 null이면 notFound()를 호출해야 한다.
 *
 * @param supabase 호출자의 본인 세션 클라이언트.
 *   ★getBookById와 동일하게 **캐시 경로에서 사용하지 않는다** — 시그니처 정합을 위해
 *   인자만 유지한다(ADR-0033 안전 원칙).
 * @param id       books.id UUID. 형식 검증은 호출 측 책임.
 */
export async function getBookByIdIncludingInactive(
  supabase: SupabaseClient,
  id: string,
): Promise<Book | null> {
  void supabase; // 캐시 경로 미사용(ADR-0033) — getBookById와 동일.
  return getBookByIdAnyCached(id);
}
