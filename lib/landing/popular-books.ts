import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 랜딩 인기 책 섹션 데이터 — books 테이블에서 활성 책 중 일부를 무작위로 고른다.
 *
 * ADR-0012 결정 3 — Supabase JS는 ORDER BY RANDOM()을 직접 지원하지 않는다.
 * RPC 함수를 만들면 DB 객체 추가 = Hard Rule 8(DB 변경 시 ADR·마이그레이션 선행)이
 * 발동하므로, 무작위 선정은 애플리케이션 코드에서 처리한다:
 *   1) is_active = true 책의 id 목록을 조회
 *   2) JS Fisher-Yates 부분 셔플로 count개를 무작위 선정
 *   3) 선정된 id의 책 상세를 다시 조회
 *
 * books 테이블의 RLS 정책 "books are viewable by everyone"(USING(true)) 덕분에
 * 비로그인 방문자 세션(publishable 키)으로도 조회된다.
 *
 * 표지 캡션에 쓸 title·author를 함께 가져온다(ADR-0013 결정 1).
 *
 * ★ 랜딩 임시 조치 (phase-09a CP3) — 후보를 source_platform='book_dash'로 한정한다.
 *   CP3 표지 진단에서 GDL 표지 28% 정상률(842권 중 약 606권 404)이 확인되어,
 *   표지 90% 정상률인 Book Dash 안에서만 랜덤 6권을 뽑는다. phase-09b
 *   (GDL 표지 정정·재동기화) 완료 후 전 카탈로그 환원을 재검토한다
 *   (docs/adr/0012-landing-page-static.md 결정 3 보강).
 *
 * 의도 문서: docs/intent/screen-01-landing.md 4.3절
 */

/** 랜딩 인기 책 섹션에 노출하는 책 수. */
export const POPULAR_BOOKS_COUNT = 6;

/**
 * 랜딩 인기 책 후보 소스 — phase-09a 임시 조치로 Book Dash로 한정한다.
 * phase-09b에서 GDL 표지가 정정되면 이 제한을 환원/재검토한다.
 */
const LANDING_SOURCE_PLATFORM = 'book_dash';

/** 랜딩 표지 카드 1장에 필요한 책 데이터. */
export interface PopularBook {
  id: string;
  title: string;
  /** books.author는 nullable — 없으면 캡션에서 저자 줄을 생략한다(ADR-0013). */
  author: string | null;
  coverUrl: string;
}

/** books 테이블 id 조회 행. */
interface BookIdRow {
  id: string;
}

/** books 테이블 표지 카드 조회 행. */
interface BookCardRow {
  id: string;
  title: string;
  author: string | null;
  cover_url: string;
}

/**
 * 활성 책 중 count권을 무작위로 골라 표지 카드 데이터로 반환한다.
 *
 * @param supabase 호출자가 만든 Supabase 클라이언트(publishable 키 세션).
 * @param count    노출할 책 수. 기본 POPULAR_BOOKS_COUNT(6).
 * @returns 무작위 책 목록. 활성 책이 count보다 적으면 있는 만큼만 반환한다.
 */
export async function getPopularBooks(
  supabase: SupabaseClient,
  count: number = POPULAR_BOOKS_COUNT,
): Promise<PopularBook[]> {
  // 1) 활성 책 id 목록 조회
  const { data: idRows, error: idError } = await supabase
    .from('books')
    .select('id')
    .eq('is_active', true)
    .eq('source_platform', LANDING_SOURCE_PLATFORM)
    .returns<BookIdRow[]>();

  if (idError) {
    throw new Error(`getPopularBooks: 활성 책 id 조회 실패 — ${idError.message}`);
  }
  if (!idRows || idRows.length === 0) {
    return [];
  }

  // 2) JS 무작위 선정
  const pickedIds = pickRandom(
    idRows.map((row) => row.id),
    count,
  );

  // 3) 선정된 책 상세 조회
  const { data: bookRows, error: bookError } = await supabase
    .from('books')
    .select('id, title, author, cover_url')
    .in('id', pickedIds)
    .returns<BookCardRow[]>();

  if (bookError) {
    throw new Error(`getPopularBooks: 책 상세 조회 실패 — ${bookError.message}`);
  }

  return (bookRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    author: row.author,
    coverUrl: row.cover_url,
  }));
}

/**
 * Fisher-Yates 부분 셔플 — 원본을 변경하지 않고 무작위 count개를 고른다.
 * count가 items 길이보다 크면 items 전체를 무작위 순서로 반환한다.
 */
function pickRandom<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  const limit = Math.min(Math.max(count, 0), pool.length);
  for (let i = 0; i < limit; i += 1) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, limit);
}
