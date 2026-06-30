import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import type { SupabaseClient } from '@supabase/supabase-js';

import { SIGN_IN_PATH } from '@/lib/auth/routes';
import type { PopularBook } from '@/lib/landing/popular-books';
import { createClient } from '@/lib/supabase/server';

import { ShowcaseGrid } from '../showcase-grid';
import { isKnownSource, sourceLabel } from '../sources';

/**
 * /showcase/[source] — 임시 시연 메뉴: 한 출처의 공개 도서 그리드(무한 스크롤).
 *
 * 임시·격리. 가드는 로그인만(/showcase 정합). [source]는 source_platform DB 값이며
 * 화이트리스트(SOURCE_LABELS 키)에 없으면 not-found.
 *
 * 쿼리: WHERE source_platform=[source] AND is_active=true ORDER BY title, id (전량).
 *   - is_active=true 필수 — 비공개(staging) 누출 차단(Hard Rule 3 정합).
 *   - Supabase 기본 1000행 cap이 있어 range 청크 루프로 전량 조회한다.
 *   - 정렬은 (title, id) — id tiebreak로 동명 책의 slice 경계 흔들림(중복·누락) 방지.
 *   - 전량을 ShowcaseGrid(클라)에 넘겨 IntersectionObserver로 점진 렌더(후보 B 채택).
 *     ASb 2,160행 전량 조회 ~0.3s 실측, server action 없이 단순. (필터 0이라 가능.)
 *   - 카드 클릭 → 기존 책 경로 /book/[id] (새 뷰어 미생성).
 *   - SELECT only. INSERT/UPDATE 0건.
 */

/** range 청크 크기 — Supabase 기본 max rows(1000)와 정합. */
const FETCH_CHUNK = 1000;
/** 폭주 방지 안전 상한(현재 최대 출처 ASb 2,160 << 이 값). */
const FETCH_MAX = 10000;

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '출처별 도서 (시연) · 키키북스',
  robots: { index: false, follow: false },
};

interface BookRow {
  id: string;
  title: string;
  author: string | null;
  cover_url: string;
}

function toPopularBook(row: BookRow): PopularBook {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    coverUrl: row.cover_url,
  };
}

/**
 * 한 출처의 공개 도서 전량을 (title, id) 안정 정렬로 조회한다.
 *
 * Supabase 기본 1000행 cap 때문에 .range()로 청크 반복한다. 동일 ORDER BY 위에서의
 * offset 페이지네이션이라 청크 경계에 중복·누락이 없다(시연 중 동시 쓰기 없음 전제).
 */
async function fetchAllBySource(
  supabase: SupabaseClient,
  source: string,
): Promise<PopularBook[]> {
  const out: BookRow[] = [];
  for (let start = 0; start < FETCH_MAX; start += FETCH_CHUNK) {
    const { data, error } = await supabase
      .from('books')
      .select('id, title, author, cover_url')
      .eq('is_active', true)
      .eq('source_platform', source)
      .order('title', { ascending: true })
      .order('id', { ascending: true })
      .range(start, start + FETCH_CHUNK - 1)
      .returns<BookRow[]>();
    if (error) {
      throw new Error(`/showcase/${source}: books 조회 실패 — ${error.message}`);
    }
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < FETCH_CHUNK) break;
  }
  return out.map(toPopularBook);
}

interface ShowcaseSourcePageProps {
  params: { source: string };
}

export default async function ShowcaseSourcePage({
  params,
}: ShowcaseSourcePageProps) {
  const { source } = params;

  // 화이트리스트 검증 — enum 외 값은 not-found.
  if (!isKnownSource(source)) {
    notFound();
  }

  // 가드: 로그인만 (/showcase 정합 — 미들웨어 미가드 라우트라 직접).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(SIGN_IN_PATH);
  }

  // 해당 출처의 공개 도서 전량(is_active=true)을 (title, id) 안정 정렬로 조회.
  const books = await fetchAllBySource(supabase, source);

  return (
    <main className="min-h-screen bg-surface-2 py-6">
      <div className="mx-auto flex max-w-screen-sm flex-col gap-4 px-4 md:max-w-screen-md md:gap-5 md:px-6 lg:max-w-screen-lg">
        <header className="flex flex-col gap-2">
          <Link
            href="/showcase"
            className="text-sm font-medium text-text-variant outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            ← 출처 목록
          </Link>
          <h1 className="font-display text-2xl font-bold text-text md:text-3xl">
            {sourceLabel(source)}
          </h1>
          <p className="text-sm text-text-variant">총 {books.length}권</p>
        </header>

        {books.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-outline bg-surface px-5 py-12 text-center shadow-elev-1">
            <h2 className="font-display text-lg font-semibold text-text">
              공개된 책이 없어요
            </h2>
            <p className="text-sm text-text-variant">
              이 출처에는 아직 공개 도서가 없습니다.
            </p>
          </div>
        ) : (
          <ShowcaseGrid books={books} />
        )}
      </div>
    </main>
  );
}
