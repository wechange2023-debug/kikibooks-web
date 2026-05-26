import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { AttributionBox } from '@/components/book/attribution-box';
import { BookCoverHero } from '@/components/book/book-cover-hero';
import { BookMeta } from '@/components/book/book-meta';
import { ReadButton } from '@/components/book/read-button';
import { SIGN_IN_PATH } from '@/lib/auth/routes';
import { buildAttributionRows } from '@/lib/book/attribution';
import { getBookDetailCopy } from '@/lib/book/copy';
import { getBookById } from '@/lib/book/detail';
import { BOOK_DASH_404_SOURCE_IDS } from '@/lib/shared/blacklist';
import { createClient } from '@/lib/supabase/server';

/**
 * /book/[id] — Screen 03 책 상세 페이지.
 *
 * 베타 법적 의무: AttributionBox 100% 표시 (license-rules.md §5).
 *
 * 가드 4종 (notFound 단일 출구로 사용자 사유 비노출, intent §5.5 일관 UX):
 *   1. params.id UUID 형식 불일치 → notFound (사전 차단, DB 호출 방지)
 *   2. 미인증 → redirect(/login) (미들웨어 자동 1차, 본 페이지 2차 안전망)
 *   3. ADR-0014 Amendment #4 블랙리스트 4 UUID 일치 → notFound
 *   4. books 행 NULL (없음·is_active=false·RLS 차단) → notFound
 *
 * 페이지 구조 (intent §5):
 *   BookCoverHero (표지 + H1 — ADR-0016 결정 3 통합 어트리뷰션 단위)
 *   BookMeta      (레벨·연령·언어 칩 — Book Dash NULL 안전 분기)
 *   AttributionBox (5요소 — ADR-0016 결정 1·2 분기, buildAttributionRows 책임)
 *   ReadButton    (phase-12 자리 — /book/[id]/read 404 → 자연 활성화)
 *
 * Cache 정책: export const dynamic = 'force-dynamic' (phase-10 cp1_decisions d3 정합).
 *
 * Metadata: 정적 metadata + robots noindex 이중 방어 (ADR-0013 결정 4 closed environment).
 *   app/robots.ts '/book' disallow와 함께 동작. 동적 generateMetadata는 phase-13b 이후
 *   OG/SNS 결정 시점.
 *
 * 자녀 가드 미적용 (intent §3·§4.3): 책 상세는 자녀 무관.
 *
 * Server Component — 'use client' 없음. 클라이언트 상태는 자식 컴포넌트(BookCoverHero,
 * ReadButton 등)에 한정.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '책 상세 · 키키북스',
  robots: { index: false, follow: false },
};

/** 표준 UUID 형식 (gen_random_uuid v4 포함). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface BookDetailPageProps {
  params: { id: string };
}

export default async function BookDetailPage({ params }: BookDetailPageProps) {
  // 가드 1: UUID 형식 사전 차단 — DB 호출 방지 + 보안
  if (!UUID_RE.test(params.id)) {
    notFound();
  }

  // 가드 2: 미인증 안전망 — 미들웨어가 1차, 본 페이지가 2차 (phase-07 정합)
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(SIGN_IN_PATH);
  }

  // 가드 4·정상 fetch 병렬 — book + copy 의존성 없음
  const [book, copy] = await Promise.all([
    getBookById(supabase, params.id),
    getBookDetailCopy(),
  ]);

  if (!book) {
    notFound();
  }

  // 가드 3: ADR-0014 Amendment #4 블랙리스트 4 UUID 차단
  if (
    book.source_platform === 'book_dash' &&
    (BOOK_DASH_404_SOURCE_IDS as readonly string[]).includes(book.source_id)
  ) {
    notFound();
  }

  const rows = buildAttributionRows(book, copy);

  return (
    <main className="min-h-screen bg-surface-2 py-6">
      <div className="mx-auto flex max-w-screen-sm flex-col gap-5 px-4 md:max-w-screen-md md:gap-6 md:px-6 lg:max-w-screen-lg">
        <BookCoverHero book={book} />
        <BookMeta book={book} />
        <AttributionBox rows={rows} />
        <div className="flex justify-center">
          <ReadButton bookId={book.id} label={copy.readButton.label} />
        </div>
      </div>
    </main>
  );
}
