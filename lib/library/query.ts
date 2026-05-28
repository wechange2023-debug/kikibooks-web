import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { BOOK_DASH_404_SOURCE_IDS } from '@/lib/shared/blacklist';
import {
  isCategorySlug,
  matchCategories,
  type CategorySlug,
} from '@/lib/home/categories';
import type { PopularBook } from '@/lib/landing/popular-books';

/**
 * 라이브러리 페이지(Screen 05 `/library`) 책 카탈로그 조회 단일 출처.
 *
 * phase-13 CP3-a 신규 (ADR-0018 D7·D12 + spec d7·d8 + intent §4.4·§5.3·§5.4).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 책 카드 데이터 타입 = PopularBook 재사용 (LibraryBook 신규 미생성)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - 사유: intent §5.3 LibraryBrowser '책 카드: components/landing/book-cover-card.tsx
 *     (또는 홈 추천 카드) 재사용' 박제. design-system §1.8 '자녀 레벨 매핑'은
 *     '책 표지 테두리·레벨 선택 바·추천 책 라벨'에만 적용을 명시하고 라이브러리
 *     카드 레벨 배지는 명시하지 않는다(RecommendationCard도 현재 레벨 배지 미노출).
 *     라이브러리 카드 레벨 배지 노출은 phase-2 또는 baseline 데이터 확보 후로 이연(F-item).
 *   - PopularBook = { id, title, author: string|null, coverUrl } — books 컬럼과 정합.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * cursor 페이지네이션 = 복합 keyset (synced_at DESC, id ASC) — ADR-0018 D7 '구현 CP 확정' 채택
 * ──────────────────────────────────────────────────────────────────────────────
 *   - ADR-0018 D7은 'synced_at DESC + cursor 또는 id 안정 정렬'을 구현 CP에 위임한다.
 *     본 CP는 두 키를 결합한 복합 keyset을 채택한다.
 *   - 사유: 활성 896권 중 대부분이 같은 sync 배치(GDL 842권·Book Dash 54권)에서
 *     synced_at이 동일·근접하다. 단일 synced_at cursor는 페이지 경계에서 같은
 *     timestamp의 책이 잘려 중복·누락 위험이 크다. (synced_at, id) 복합 keyset은
 *     `WHERE synced_at < $cursor.synced_at
 *         OR (synced_at = $cursor.synced_at AND id > $cursor.id)` 한 줄로 안정 정렬과
 *     신간 우선을 동시 보존한다(.or() 한 단계 비용만 추가).
 *   - cursor는 opaque base64url 인코딩 문자열로 외부에 노출한다 — CP3-b 클라이언트는
 *     내용을 모르므로 향후 정렬·인덱스 변경 시 인코딩만 교체하면 된다.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 카테고리 필터 = query.ts 단일 흡수 (categories.ts getCategoryBooks 2단계 패턴 정합)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - 카테고리 미선택: DB 측 keyset cursor만으로 페이지네이션 (최선 효율).
 *   - 카테고리 선택: 후보 책 전수(is_active + 블랙리스트 + level + keyword 적용 후)를
 *     synced_at DESC, id ASC 정렬로 조회 → JS matchCategories 필터링 →
 *     메모리 슬라이스 페이지네이션. cursor는 index 모드(opaque).
 *   - 두 모드는 LibraryPage 계약이 같다(books·nextCursor·hasMore). CP3-b 컴포넌트는
 *     모드 차이를 모른다(ADR-0015 단일 출처 패턴 정합).
 *   - 카탈로그 5,000+ 규모에서 카테고리 모드 메모리 슬라이스는 비용 증가 — F-item 박제.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 적용 필터 (누적, home/recommendations.ts·categories.ts 패턴 정합)
 * ──────────────────────────────────────────────────────────────────────────────
 *   1) .eq('is_active', true)                      — Hard Rule 3 NC/ND 사전 차단 정합
 *   2) BOOK_DASH_404_SOURCE_IDS .neq 루프          — ADR-0014 결정 2 (표면 6번째 합류)
 *   3) level 선택 시 .eq('level', N)               — level NULL 책은 자연 제외
 *   4) keyword 시 .ilike('title', '%kw%')          — author 검색은 baseline 외 (F-item)
 *   5) keyset cursor (비카테고리) 또는 메모리 슬라이스 (카테고리)
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * RLS·보안 점검
 * ──────────────────────────────────────────────────────────────────────────────
 *   - books §9.1 USING(true) — 본인 세션 createServerClient(publishable 키)로 정상 SELECT.
 *   - createServiceRoleClient(secret 키) 절대 미사용 — 옵션 B는 보상 쓰기 전용(ADR-0018 D1).
 *   - SELECT only. INSERT/UPDATE/DELETE 0건 — Hard Rule 8 스키마 변경 0건.
 *   - Hard Rule 1: 카드 데이터는 표지·title·author만 노출. attribution_text는 책 상세
 *     `/book/[id]`(BookCoverHero + AttributionBox)가 책임 (ADR-0013·0016 정합).
 *   - Hard Rule 6·9·10: SELECT 데이터만 — secret 0건, iframe 0건, raw HEX 0건.
 *
 * 의도 문서: docs/intent/screen-05-celebrate.md §4.4·§5.3·§5.4
 */

/** 한 페이지 책 수. CATEGORY_BOOKS_CAP(24)과 정합. */
export const LIBRARY_PAGE_SIZE = 24;

/** 키워드 검색 최대 입력 길이 (LibraryFilters zod + UI input maxLength 정합). */
export const LIBRARY_KEYWORD_MAX = 50;

/**
 * /library 쿼리 파라미터 검증 스키마 (D7 3-가드 ③ 필터 입력 검증).
 *
 *   - level: 1~5 정수 (URL search param coerce)
 *   - category: CategorySlug 검증 (categories.ts isCategorySlug 재사용)
 *   - keyword: trim + max LIBRARY_KEYWORD_MAX
 *
 * 빈 문자열·미정의 필드는 optional로 통과 → 필터 미적용으로 해석.
 */
export const LibraryFiltersSchema = z.object({
  level: z.coerce.number().int().min(1).max(5).optional(),
  category: z
    .string()
    .refine((value): value is CategorySlug => isCategorySlug(value), {
      message: 'invalid category slug',
    })
    .optional(),
  keyword: z.string().trim().max(LIBRARY_KEYWORD_MAX).optional(),
});

export type LibraryFilters = z.infer<typeof LibraryFiltersSchema>;

/**
 * 라이브러리 페이지 1건의 응답 — 책 배열·다음 cursor·hasMore 플래그.
 * count(총 권수)는 반환하지 않는다(F-item, 베타 단순성).
 */
export interface LibraryPage {
  books: PopularBook[];
  /** 다음 페이지 조회용 opaque cursor. 마지막 페이지면 null. */
  nextCursor: string | null;
  /** UI sentinel 표시용 — nextCursor !== null과 동일. */
  hasMore: boolean;
}

/** keyset cursor 디코딩 결과 — synced_at + id로 마지막 책 위치 표시. */
interface KeysetCursor {
  mode: 'keyset';
  /** 이전 페이지 마지막 책의 synced_at (ISO 8601). */
  sa: string;
  /** 이전 페이지 마지막 책의 id (UUID). */
  id: string;
}

/** index cursor — 카테고리 모드의 메모리 슬라이스 시작 인덱스. */
interface IndexCursor {
  mode: 'index';
  /** 다음 페이지 시작 인덱스. */
  i: number;
}

/** books 테이블에서 카드·정렬에 필요한 5 컬럼. */
interface BookRow {
  id: string;
  title: string;
  author: string | null;
  cover_url: string;
  synced_at: string;
}

/**
 * Postgres ILIKE 와일드카드 escape — 사용자 입력의 `%`·`_`·`\`를 리터럴로 처리한다.
 *
 * Supabase ilike()는 패턴 측의 `%`·`_`를 와일드카드로 해석한다 — escape하지 않으면
 * 사용자가 "100%" 같은 검색어를 입력했을 때 의도와 다른 매칭이 발생한다.
 * SQL injection 위험은 PostgREST가 별도로 차단하지만, 검색 의미 보존을 위해
 * 본 함수가 baseline escape를 책임진다.
 */
function escapeIlikePattern(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}

/**
 * opaque cursor 인코딩 — JSON → base64url. CP3-b는 내용을 모른다.
 *
 * Node.js Buffer 사용 — Next.js App Router server component·server action은 Node 런타임
 * 기본이므로 안전. Edge runtime 명시 시 `btoa(JSON.stringify(...))` 대체 필요.
 */
function encodeCursor(value: KeysetCursor | IndexCursor): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/**
 * opaque cursor 디코딩 — 손상·구버전 cursor는 null 반환(silent 폴백 = 첫 페이지).
 *
 * type guard로 mode 분기 — 잘못된 mode·필드 누락 모두 null.
 */
function decodeCursor(cursor: string): KeysetCursor | IndexCursor | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const obj = parsed as Record<string, unknown>;
    if (obj.mode === 'keyset' && typeof obj.sa === 'string' && typeof obj.id === 'string') {
      return { mode: 'keyset', sa: obj.sa, id: obj.id };
    }
    if (obj.mode === 'index' && typeof obj.i === 'number' && Number.isInteger(obj.i) && obj.i >= 0) {
      return { mode: 'index', i: obj.i };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * /library 책 목록 1페이지를 반환한다. 카테고리 유무로 두 모드로 분기한다.
 *
 *   - 카테고리 미선택: getBooksKeyset (DB cursor)
 *   - 카테고리 선택:   getBooksWithCategory (메모리 슬라이스)
 *
 * 두 모드 모두 LibraryPage 계약을 같이 반환하므로 CP3-b 컴포넌트는 모드 차이를 모른다.
 */
export async function getBooks(
  supabase: SupabaseClient,
  filters: LibraryFilters,
  cursor: string | null = null,
): Promise<LibraryPage> {
  if (filters.category) {
    return getBooksWithCategory(supabase, filters, cursor);
  }
  return getBooksKeyset(supabase, filters, cursor);
}

/**
 * keyset cursor 모드 — DB가 (synced_at DESC, id ASC)로 정렬하고 한 페이지+1권을 조회한다.
 * +1권으로 hasMore 판정, 슬라이스 후 마지막 책의 (synced_at, id)로 nextCursor 인코딩.
 */
async function getBooksKeyset(
  supabase: SupabaseClient,
  filters: LibraryFilters,
  cursor: string | null,
): Promise<LibraryPage> {
  let query = supabase
    .from('books')
    .select('id, title, author, cover_url, synced_at')
    .eq('is_active', true);

  for (const blockedSourceId of BOOK_DASH_404_SOURCE_IDS) {
    query = query.neq('source_id', blockedSourceId);
  }

  if (filters.level !== undefined) {
    query = query.eq('level', filters.level);
  }

  if (filters.keyword && filters.keyword.length > 0) {
    query = query.ilike('title', `%${escapeIlikePattern(filters.keyword)}%`);
  }

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded?.mode === 'keyset') {
      // (synced_at, id) keyset:
      //   WHERE synced_at < $sa OR (synced_at = $sa AND id > $id)
      query = query.or(
        `synced_at.lt.${decoded.sa},and(synced_at.eq.${decoded.sa},id.gt.${decoded.id})`,
      );
    }
    // 잘못된 cursor(손상·구버전·index 모드 혼입)는 silent 폴백 = 첫 페이지로 재시작.
  }

  // hasMore 판정용 +1
  query = query
    .order('synced_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(LIBRARY_PAGE_SIZE + 1);

  const { data, error } = await query.returns<BookRow[]>();
  if (error) {
    throw new Error(`getBooks(keyset): books 조회 실패 — ${error.message}`);
  }

  const rows = data ?? [];
  const hasMore = rows.length > LIBRARY_PAGE_SIZE;
  const page = rows.slice(0, LIBRARY_PAGE_SIZE);
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ mode: 'keyset', sa: last.synced_at, id: last.id })
      : null;

  return {
    books: page.map(toPopularBook),
    nextCursor,
    hasMore,
  };
}

/**
 * 카테고리 모드 — 후보 책 전수를 정렬해 조회한 뒤 JS matchCategories로 필터한다.
 * cursor는 매칭된 결과의 시작 인덱스(opaque), keyset cursor와 외부 계약이 같다.
 *
 * categories.ts getCategoryBooks 2단계 패턴 정합 — 단, CATEGORY_BOOKS_CAP(24) 단일 컷
 * 대신 무한 스크롤용 페이지네이션으로 확장. 카테고리 매핑 자체는 categories.ts 단일 출처.
 */
async function getBooksWithCategory(
  supabase: SupabaseClient,
  filters: LibraryFilters,
  cursor: string | null,
): Promise<LibraryPage> {
  let query = supabase
    .from('books')
    .select('id, title, author, cover_url, synced_at')
    .eq('is_active', true);

  for (const blockedSourceId of BOOK_DASH_404_SOURCE_IDS) {
    query = query.neq('source_id', blockedSourceId);
  }

  if (filters.level !== undefined) {
    query = query.eq('level', filters.level);
  }

  if (filters.keyword && filters.keyword.length > 0) {
    query = query.ilike('title', `%${escapeIlikePattern(filters.keyword)}%`);
  }

  query = query
    .order('synced_at', { ascending: false })
    .order('id', { ascending: true });

  const { data, error } = await query.returns<BookRow[]>();
  if (error) {
    throw new Error(`getBooks(category): books 조회 실패 — ${error.message}`);
  }

  const rows = data ?? [];
  // filters.category는 본 분기 진입 조건에서 truthy로 검증됨 — non-null assertion 안전.
  const targetSlug = filters.category as CategorySlug;
  const matched = rows.filter((row) =>
    matchCategories({ title: row.title }).includes(targetSlug),
  );

  let startIndex = 0;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded?.mode === 'index' && decoded.i <= matched.length) {
      startIndex = decoded.i;
    }
    // 손상·키셋 cursor 혼입은 silent 폴백 = 첫 페이지.
  }

  const endIndex = startIndex + LIBRARY_PAGE_SIZE;
  const page = matched.slice(startIndex, endIndex);
  const hasMore = endIndex < matched.length;
  const nextCursor = hasMore ? encodeCursor({ mode: 'index', i: endIndex }) : null;

  return {
    books: page.map(toPopularBook),
    nextCursor,
    hasMore,
  };
}

/** BookRow → PopularBook 변환 (cover_url → coverUrl camelCase, synced_at 미노출). */
function toPopularBook(row: BookRow): PopularBook {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    coverUrl: row.cover_url,
  };
}
