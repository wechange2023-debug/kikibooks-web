import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * /admin/review 검수 화면 조회 단일 출처 (ADR-0051 구현 1 신규).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용
 * ──────────────────────────────────────────────────────────────────────────────
 *   - ADR-0051 D5: book_text·book_review는 활성 도서 한정 정책과 무관하게 전량 조회해야
 *     하므로 createServiceRoleClient로 직접 조회한다. getBookById 사용 0건
 *     (is_active=true 강제 회피 — 152권 검수 대상은 대부분 아직 비공개).
 *   - migration 006 §3.2: book_review는 SELECT 정책 0개 = service_role 전용. anon·본인
 *     세션 클라이언트로는 0행이 돌아온다 → service role 외 선택지 없음.
 *   - ADR-0019 D5·D2 ④단: admin SELECT = createServiceRoleClient + 호출자 가드 통과 후만
 *     호출. 본 모듈은 SELECT 전용 — UPDATE/INSERT/DELETE 0건(구현 2의 server action 책임).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 호출자 책임 박제 (Hard Rule 6)
 * ──────────────────────────────────────────────────────────────────────────────
 *   호출 전 호출자는 admin 가드를 통과해야 한다:
 *     - page Server Component: app/admin/layout.tsx의 requireAdmin이 보증(ADR-0019 D16)
 *     - server action(구현 2 예정): assertAdmin()의 ok:true 반환 후 호출
 *   본 모듈 내부는 가드 0건 — 호출자가 가드 통과를 보장한다는 신뢰 경계 채택.
 *   `import 'server-only'`로 클라이언트 번들 포함 시 빌드 실패 강제.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * slug의 출처 (주의)
 * ──────────────────────────────────────────────────────────────────────────────
 *   books 테이블에 slug 컬럼은 존재하지 않는다(001_initial_schema.sql). 152권 검수 코호트의
 *   slug는 books.source_id다 — scripts/pdf_harvest/upload_page_images.py:9-10
 *   "source_id = slug 코호트(ADR-0047 D1 조인 근거)".
 *   따라서 본 모듈은 source_id를 조회해 slug로 노출한다.
 *
 *   ※ 이 값은 **더 이상 이미지 URL 조립에 쓰이지 않는다**(ADR-0057 D2 — 조립 폐기,
 *     book_text.image_url 단일 출처). 현재 용도는 화면 표시·회전 의심면 판정
 *     (lib/admin/review/rotation-pages.ts)·목록 코호트 필터 3가지다.
 *
 * ADR: docs/adr/0051-admin-review-screen.md D1·D2·D5
 * 패턴 정합: lib/admin/books/query.ts (server-only + service role + 단일 export)
 */

/**
 * book_review.status 5상태 — migration 009 CHECK 제약과 동일 집합.
 *
 * 원안은 4상태(ADR-0046 D6 · migration 006)였고, ADR-0058 D2가 `tts_requested`를 추가했다
 * (2026-08-13 적용 완료). 이 유니온이 곧 화면·서버의 상태 집합 단일 출처다 —
 * 값이 하나 늘면 Record<ReviewStatus, …> 매핑(신호등 2곳·전이표)이 컴파일 단계에서
 * 누락을 잡아준다.
 */
export type ReviewStatus =
  | 'draft'
  | 'in_review'
  | 'confirmed'
  | 'tts_requested'
  | 'tts_done';

/**
 * status 노출 순서 (ADR-0051 D3 + ADR-0058 D2 전이 순서 = 파이프라인 진행 순서).
 *
 * 문자열 정렬을 쓰면 confirmed → draft → in_review → tts_done 이 되어 파이프라인 순서와
 * 무관해진다. 배열 인덱스 기반 정렬로
 * draft → in_review → confirmed → tts_requested → tts_done 을 강제한다.
 * tts_requested는 confirmed 다음·tts_done 앞이다(요청 → 합성 완료 순, ADR-0058 D2).
 */
const STATUS_ORDER: readonly ReviewStatus[] = [
  'draft',
  'in_review',
  'confirmed',
  'tts_requested',
  'tts_done',
];

/** 정렬 키. 미지의 status 값(향후 CHECK 확장)은 맨 뒤로 보낸다. */
function statusRank(status: ReviewStatus): number {
  const index = STATUS_ORDER.indexOf(status);
  return index === -1 ? STATUS_ORDER.length : index;
}

/** /admin/review 목록 1행. */
export interface ReviewBookListRow {
  bookId: string;
  title: string;
  /** = books.source_id. 화면 표시·회전 판정·코호트 필터용(이미지 조립 용도 폐기, ADR-0057 D2). */
  slug: string;
  /**
   * = books.source_platform. 목록의 코호트 필터 기준(ADR-0058 D5).
   *
   * 시드 후 목록이 152권 → 860권이 되어 기존 검수 큐(Book Dash PDF)와 신규 코호트가
   * 한 화면에 섞인다. ADR-0056 O5 검토항목 3의 해소 수단이 이 필터다.
   */
  platform: string;
  status: ReviewStatus;
  updatedAt: string;
}

/** /admin/review/[bookId] 상세 1페이지. */
export interface ReviewPage {
  /** 0-based (ADR-0046 D2). */
  pageIndex: number;
  text: string;
  /**
   * book_text.image_url 원본(ADR-0057 D2). 화면은 이 값을 그대로 <img src>에 쓴다 —
   * 조립 0건. null = 이미지 없는 면(정상, ADR-0025 Amd#6 A3).
   * 오디오 리더(lib/book/audio-manifest.ts)와 동일 출처다(ADR-0052 D4 · ADR-0057 D4).
   */
  imageUrl: string | null;
}

/** /admin/review/[bookId] 상세 전체. */
export interface ReviewBookDetail {
  bookId: string;
  title: string;
  slug: string;
  status: ReviewStatus;
  /**
   * book_audio 행이 1행이라도 있는가 (ADR-0058 D4).
   *
   * **voice 무관 판정**이다 — 구 `Ruth`든 `danielle`이든 행이 있으면 true.
   * true면 화면은 TTS 요청 버튼을 잠근다. 최종 판정은 화면이 아니라 서버가 한다
   * (actions.ts가 전이 직전 같은 조건을 다시 조회 — 클라이언트 잠금 불신 원칙).
   *
   * 목록(ReviewBookListRow)에는 같은 필드를 두지 않았다: 860권 × book_audio 존재 판정은
   * PostgREST에서 1만 행대 조회 + 페이지네이션이 되어 목록 1회 렌더 비용이 급증한다.
   * 버튼이 상세에만 있으므로 상세에서 책 1권분만 판정한다(N+1 아님 — 페이지당 1회).
   */
  hasAudio: boolean;
  pages: ReviewPage[];
}

/** book_review + books 임베드 조회 raw 행. */
interface ReviewJoinRow {
  book_id: string;
  status: ReviewStatus;
  updated_at: string;
  books: { title: string; source_id: string; source_platform: string } | null;
}

/**
 * PostgREST 임베드는 관계 카디널리티 추론에 따라 객체 또는 1원소 배열로 돌아온다.
 * book_review.book_id는 books(id) 참조 + unique이므로 객체가 기대값이지만, 배열로 와도
 * 깨지지 않도록 정규화한다.
 */
function embeddedBook(
  value: ReviewJoinRow['books'] | ReviewJoinRow['books'][],
): { title: string; source_id: string; source_platform: string } | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

/**
 * /admin/review 목록 — book_review 전건 + books.title/source_id/source_platform 조인.
 *
 * 페이지네이션 0건 — 종전에는 152권 고정 코호트였다. ADR-0058 D5 시드로 **860권**
 * (Book Dash 191 + african_storybook 527 + bloom 142)이 됐고, 전건 1회 조회를 유지한다.
 * PostgREST 기본 상한(1,000행)이 아직 충분하며, 화면단 코호트 필터(D5)가 노출을 나눈다.
 * 상한을 넘길 규모가 되면 lib/admin/books/query.ts의 keyset cursor 패턴으로 옮긴다
 * (ADR-0058 O4 — 조회 성능 실측 후 판단).
 *
 * 정렬: statusRank(draft→in_review→confirmed→tts_requested→tts_done) 우선, 동순위는
 * title 오름차순. DB ORDER BY로는 배열 순서를 표현할 수 없어 조회 후 메모리 정렬.
 *
 * 호출자 책임: requireAdmin/assertAdmin 통과 후 호출. 본 함수는 가드 0건.
 */
export async function getReviewBookList(): Promise<ReviewBookListRow[]> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('book_review')
    .select('book_id, status, updated_at, books(title, source_id, source_platform)')
    .returns<ReviewJoinRow[]>();

  if (error) {
    throw new Error(`getReviewBookList: book_review 조회 실패 — ${error.message}`);
  }

  /**
   * 행 상한 fail-loud 가드 (ADR-0058 O4).
   *
   * 이 프로젝트의 PostgREST는 응답 행을 1,000으로 자른다(scripts/tts_pilot/run_tts_full708.py의
   * `.range(start, start+999)` + `len(rows) < 1000` 종료 조건이 그 관행의 증거다).
   * 잘리면 목록에서 책이 조용히 사라지는데, 그건 ADR-0056 O5가 겪은 증상과 똑같다
   * ("검수 화면에 안 뜬다"). 조용한 잘림 대신 즉시 실패시킨다 — 860행 시점에서 여유는 140행뿐이다.
   */
  if ((data ?? []).length >= 1000) {
    throw new Error(
      'getReviewBookList: 조회 결과가 행 상한(1,000)에 도달했다 — 목록이 잘렸을 수 있다. ' +
        'keyset cursor 페이지네이션 도입이 필요하다(ADR-0058 O4).',
    );
  }

  const rows: ReviewBookListRow[] = (data ?? []).flatMap((row) => {
    const book = embeddedBook(row.books);
    // books 행이 없는 book_review는 이론상 불가(FK on delete cascade). 방어적으로 제외.
    if (!book) {
      return [];
    }
    return [
      {
        bookId: row.book_id,
        title: book.title,
        slug: book.source_id,
        platform: book.source_platform,
        status: row.status,
        updatedAt: row.updated_at,
      },
    ];
  });

  rows.sort((a, b) => {
    const rank = statusRank(a.status) - statusRank(b.status);
    return rank !== 0 ? rank : a.title.localeCompare(b.title);
  });

  return rows;
}

/**
 * /admin/review/[bookId] 상세 — books.title/source_id + book_review.status +
 * book_text 전 페이지(page_index asc).
 *
 * 조회 2회:
 *   1) book_review + books 임베드 (해당 책 1행)
 *   2) book_text 전 페이지 (page_index asc)
 * book_text는 책당 최대 14행(152권 × 14 = 2,128행) — LIMIT 0건.
 *
 * @returns 대상 book_review 행이 없으면 null(호출 page에서 notFound() 처리).
 *          book_text가 0행이어도 pages: []로 정상 반환한다 — 적재 누락을 화면에서
 *          "빈 책"으로 드러내는 편이 404보다 진단에 유리하다.
 *
 * 호출자 책임: requireAdmin/assertAdmin 통과 후 호출. 본 함수는 가드 0건.
 */
export async function getReviewBookDetail(
  bookId: string,
): Promise<ReviewBookDetail | null> {
  const supabase = createServiceRoleClient();

  const { data: reviewRow, error: reviewError } = await supabase
    .from('book_review')
    .select('book_id, status, updated_at, books(title, source_id, source_platform)')
    .eq('book_id', bookId)
    .maybeSingle<ReviewJoinRow>();

  if (reviewError) {
    throw new Error(
      `getReviewBookDetail: book_review 조회 실패 — ${reviewError.message}`,
    );
  }

  const book = reviewRow ? embeddedBook(reviewRow.books) : null;
  if (!reviewRow || !book) {
    return null;
  }

  const { data: textRows, error: textError } = await supabase
    .from('book_text')
    .select('page_index, text, image_url')
    .eq('book_id', bookId)
    .order('page_index', { ascending: true })
    .returns<
      { page_index: number; text: string; image_url: string | null }[]
    >();

  if (textError) {
    throw new Error(
      `getReviewBookDetail: book_text 조회 실패 — ${textError.message}`,
    );
  }

  /**
   * 오디오 보유 판정 (ADR-0058 D4) — 이 책 1권분만, voice 무관, 1행만 확인.
   *
   * `limit(1)`이라 book_audio가 몇 행이든 왕복 1회·응답 최대 1행이다. 화면은 이 값으로
   * TTS 요청 버튼을 잠그지만, 그건 UX일 뿐이고 실제 거부는 actions.ts가 한다.
   */
  const { data: audioRows, error: audioError } = await supabase
    .from('book_audio')
    .select('book_id')
    .eq('book_id', bookId)
    .limit(1)
    .returns<{ book_id: string }[]>();

  if (audioError) {
    throw new Error(
      `getReviewBookDetail: book_audio 조회 실패 — ${audioError.message}`,
    );
  }

  return {
    bookId: reviewRow.book_id,
    title: book.title,
    slug: book.source_id,
    status: reviewRow.status,
    hasAudio: (audioRows ?? []).length > 0,
    pages: (textRows ?? []).map((row) => ({
      pageIndex: row.page_index,
      text: row.text,
      imageUrl: row.image_url,
    })),
  };
}
