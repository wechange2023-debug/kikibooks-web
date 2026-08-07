import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { AttributionBox } from '@/components/book/attribution-box';
import { BookCoverHero } from '@/components/book/book-cover-hero';
import { BookMeta } from '@/components/book/book-meta';
import { FavoriteButton } from '@/components/book/favorite-button';
import { ReadButton } from '@/components/book/read-button';
import { SIGN_IN_PATH } from '@/lib/auth/routes';
import { buildAttributionRows } from '@/lib/book/attribution';
import { getBookDetailCopy } from '@/lib/book/copy';
import { getBookById } from '@/lib/book/detail';
import { getActiveChild } from '@/lib/home/active-child';
import { BOOK_DASH_404_SOURCE_IDS } from '@/lib/shared/blacklist';
import { createClient } from '@/lib/supabase/server';
import { BRAND_NAME } from '@/lib/brand';

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
 *   ReadButton + FavoriteButton (같은 행 — Primary CTA + 보조 토글)
 *
 * Cache 정책: export const dynamic = 'force-dynamic' (phase-10 cp1_decisions d3 정합).
 *
 * Metadata: 정적 metadata + robots noindex 이중 방어 (ADR-0013 결정 4 closed environment).
 *   app/robots.ts '/book' disallow와 함께 동작. 동적 generateMetadata는 phase-13b 이후
 *   OG/SNS 결정 시점.
 *
 * 자녀 가드 미적용 (intent §3·§4.3): 책 상세는 자녀 무관 — 자녀가 없어도 페이지는 정상
 *   렌더된다(redirect 0건). 단 즐겨찾기는 favorites.child_id NOT NULL이라 자녀가 필요하므로,
 *   getActiveChild 결과가 null이면 **FavoriteButton만 미렌더**한다(페이지는 그대로).
 *
 * 즐겨찾기 (ADR-0024 Amendment O1 — D5-a 베타 포함):
 *   활성 자녀가 있을 때만 favorites 초기 상태를 SELECT해 initialFavorited를 산출하고
 *   FavoriteButton에 주입한다. 쓰기는 lib/book/favorite.ts의 server action이 전담한다.
 *   배치는 ReadButton과 같은 행 — BookCoverHero 내부에는 넣지 않는다.
 *
 * Server Component — 'use client' 없음. 클라이언트 상태는 자식 컴포넌트(BookCoverHero,
 * FavoriteButton 등)에 한정.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `책 상세 · ${BRAND_NAME}`,
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

  // 가드 4·정상 fetch 병렬 — book + copy + activeChild 상호 의존성 없음.
  // activeChild는 즐겨찾기 초기 상태 조회에만 쓰이며, 페이지 가드로는 쓰지 않는다(자녀 0명
  // 이어도 책 상세는 정상 렌더 — FavoriteButton만 빠진다).
  const [book, copy, activeChild] = await Promise.all([
    getBookById(supabase, params.id),
    getBookDetailCopy(),
    getActiveChild(supabase, user.id),
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

  // 즐겨찾기 초기 상태 — 활성 자녀가 있을 때만 조회한다(자녀 0명이면 버튼 자체가 없다).
  // 조회 실패는 페이지를 깨뜨리지 않고 '미즐겨찾기'로 폴백한다 — 쓰기 시점에 server action이
  // (child_id, book_id)를 다시 조회해 판정하므로 데이터 정합성은 보존된다.
  let initialFavorited = false;
  if (activeChild) {
    const { data: favorite } = await supabase
      .from('favorites')
      .select('id')
      .eq('child_id', activeChild.id)
      .eq('book_id', book.id)
      .maybeSingle<{ id: string }>();

    initialFavorited = Boolean(favorite);
  }

  return (
    <main className="min-h-screen bg-surface-2 py-6">
      <div className="mx-auto flex max-w-screen-sm flex-col gap-5 px-4 md:max-w-screen-md md:gap-6 md:px-6 lg:max-w-screen-lg">
        {/* 로그아웃·홈↔라이브러리 네비는 공통 헤더(components/app/app-header.tsx)로 수렴 — ADR-0021 D4. */}
        <BookCoverHero book={book} />
        <BookMeta book={book} audioLabel={copy.audioSupport.label} />
        <AttributionBox rows={rows} />
        {/* Primary CTA + 보조 토글 같은 행. 활성 자녀가 없으면 FavoriteButton 미렌더. */}
        <div className="flex items-start justify-center gap-3">
          <ReadButton bookId={book.id} label={copy.readButton.label} />
          {activeChild && (
            <FavoriteButton bookId={book.id} initialFavorited={initialFavorited} />
          )}
        </div>
      </div>
    </main>
  );
}
