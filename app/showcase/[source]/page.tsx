import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { SIGN_IN_PATH } from '@/lib/auth/routes';
import type { PopularBook } from '@/lib/landing/popular-books';
import { createClient } from '@/lib/supabase/server';

import { ShowcaseBookCard } from '../showcase-book-card';
import { isKnownSource, SHOWCASE_LIMIT, sourceLabel } from '../sources';

/**
 * /showcase/[source] — 임시 시연 메뉴: 한 출처의 공개 도서 그리드.
 *
 * 임시·격리. 가드는 로그인만(/showcase 정합). [source]는 source_platform DB 값이며
 * 화이트리스트(SOURCE_LABELS 키)에 없으면 not-found.
 *
 * 쿼리: WHERE source_platform=[source] AND is_active=true ORDER BY title LIMIT 100.
 *   - is_active=true 필수 — 비공개(staging) 누출 차단(Hard Rule 3 정합).
 *   - 대량 출처(African Storybook 2,160 등)는 LIMIT 100 + 안내문(★추천 채택안).
 *   - 카드 클릭 → 기존 책 경로 /book/[id] (새 뷰어 미생성).
 *   - SELECT only. INSERT/UPDATE 0건.
 */

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

  // 목록(LIMIT) + 전체 권수(head count)를 병렬 조회.
  const [listResult, countResult] = await Promise.all([
    supabase
      .from('books')
      .select('id, title, author, cover_url')
      .eq('is_active', true)
      .eq('source_platform', source)
      .order('title', { ascending: true })
      .limit(SHOWCASE_LIMIT)
      .returns<BookRow[]>(),
    supabase
      .from('books')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('source_platform', source),
  ]);

  if (listResult.error) {
    throw new Error(
      `/showcase/${source}: books 조회 실패 — ${listResult.error.message}`,
    );
  }

  const books = (listResult.data ?? []).map(toPopularBook);
  const total = countResult.count ?? books.length;
  const capped = total > SHOWCASE_LIMIT;

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
          <p className="text-sm text-text-variant" aria-live="polite">
            {capped
              ? `시연용 — 전체 ${total}권 중 ${SHOWCASE_LIMIT}권 표시`
              : `총 ${total}권`}
          </p>
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
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {books.map((book) => (
              <li key={book.id}>
                <ShowcaseBookCard book={book} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
