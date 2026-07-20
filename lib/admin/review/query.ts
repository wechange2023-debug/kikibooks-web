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
 *   "source_id = slug 코호트(ADR-0047 D1 조인 근거)". Storage 키
 *   book-images/book_dash-{slug}/NN.jpg의 {slug}가 곧 이 값이다.
 *   따라서 본 모듈은 source_id를 조회해 slug로 노출한다.
 *
 * ADR: docs/adr/0051-admin-review-screen.md D1·D2·D5
 * 패턴 정합: lib/admin/books/query.ts (server-only + service role + 단일 export)
 */

/** book_review.status 4상태 — migration 006 CHECK 제약과 동일 집합(ADR-0046 D6). */
export type ReviewStatus = 'draft' | 'in_review' | 'confirmed' | 'tts_done';

/**
 * status 노출 순서 (ADR-0051 D3 전이 순서 = 파이프라인 진행 순서).
 *
 * 문자열 정렬을 쓰면 confirmed → draft → in_review → tts_done 이 되어 파이프라인 순서와
 * 무관해진다. 배열 인덱스 기반 정렬로 draft → in_review → confirmed → tts_done 을 강제한다.
 */
const STATUS_ORDER: readonly ReviewStatus[] = [
  'draft',
  'in_review',
  'confirmed',
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
  /** = books.source_id. Storage 키 book_dash-{slug}/NN.jpg 조립에 사용. */
  slug: string;
  status: ReviewStatus;
  updatedAt: string;
}

/** /admin/review/[bookId] 상세 1페이지. */
export interface ReviewPage {
  /** 0-based (ADR-0046 D2). 이미지 파일명 NN = pageIndex + 1. */
  pageIndex: number;
  text: string;
}

/** /admin/review/[bookId] 상세 전체. */
export interface ReviewBookDetail {
  bookId: string;
  title: string;
  slug: string;
  status: ReviewStatus;
  pages: ReviewPage[];
}

/** book_review + books 임베드 조회 raw 행. */
interface ReviewJoinRow {
  book_id: string;
  status: ReviewStatus;
  updated_at: string;
  books: { title: string; source_id: string } | null;
}

/**
 * PostgREST 임베드는 관계 카디널리티 추론에 따라 객체 또는 1원소 배열로 돌아온다.
 * book_review.book_id는 books(id) 참조 + unique이므로 객체가 기대값이지만, 배열로 와도
 * 깨지지 않도록 정규화한다.
 */
function embeddedBook(
  value: ReviewJoinRow['books'] | ReviewJoinRow['books'][],
): { title: string; source_id: string } | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

/**
 * /admin/review 목록 — book_review 전건 + books.title/source_id 조인.
 *
 * 페이지네이션 0건 — 검수 대상은 152권 고정 코호트라 전건 1회 조회가 단순하다
 * (lib/admin/books/query.ts의 keyset cursor는 수천 권 카탈로그용, 여기선 불필요).
 *
 * 정렬: statusRank(draft→in_review→confirmed→tts_done) 우선, 동순위는 title 오름차순.
 * DB ORDER BY로는 배열 순서를 표현할 수 없어 조회 후 메모리 정렬(152행 — 비용 무시 가능).
 *
 * 호출자 책임: requireAdmin/assertAdmin 통과 후 호출. 본 함수는 가드 0건.
 */
export async function getReviewBookList(): Promise<ReviewBookListRow[]> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('book_review')
    .select('book_id, status, updated_at, books(title, source_id)')
    .returns<ReviewJoinRow[]>();

  if (error) {
    throw new Error(`getReviewBookList: book_review 조회 실패 — ${error.message}`);
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
    .select('book_id, status, updated_at, books(title, source_id)')
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
    .select('page_index, text')
    .eq('book_id', bookId)
    .order('page_index', { ascending: true })
    .returns<{ page_index: number; text: string }[]>();

  if (textError) {
    throw new Error(
      `getReviewBookDetail: book_text 조회 실패 — ${textError.message}`,
    );
  }

  return {
    bookId: reviewRow.book_id,
    title: book.title,
    slug: book.source_id,
    status: reviewRow.status,
    pages: (textRows ?? []).map((row) => ({
      pageIndex: row.page_index,
      text: row.text,
    })),
  };
}
