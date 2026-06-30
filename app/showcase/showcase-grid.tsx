'use client';

import { useEffect, useRef, useState } from 'react';

import type { PopularBook } from '@/lib/landing/popular-books';

import { ShowcaseBookCard } from './showcase-book-card';
import { SHOWCASE_BATCH } from './sources';

/**
 * /showcase/[source] 그리드 — 클라이언트 점진 렌더(무한 스크롤).
 *
 * 채택: 후보 B(클라이언트 점진 렌더). 서버가 해당 출처 전량(is_active=true)을 props로
 * 넘기고, 클라이언트가 IntersectionObserver로 SHOWCASE_BATCH(100)씩 끊어 렌더한다.
 *   - server action 불필요(showcase는 필터 0 — 단일 source_platform + is_active만).
 *   - 정렬·필터·누출 차단은 모두 서버(page.tsx)가 책임. 본 컴포넌트는 slice 렌더만.
 *   - books는 (title, id) 안정 정렬된 전량이라 slice 경계에 중복·누락이 없다.
 *
 * 카드는 ShowcaseBookCard 재사용(신규 카드 미생성).
 */
export function ShowcaseGrid({ books }: { books: PopularBook[] }) {
  const [count, setCount] = useState(() => Math.min(SHOWCASE_BATCH, books.length));
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hasMore = count < books.length;

  useEffect(() => {
    if (!hasMore) return;
    const target = sentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setCount((c) => Math.min(c + SHOWCASE_BATCH, books.length));
        }
      },
      { rootMargin: '0px 0px 400px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, books.length]);

  const visible = books.slice(0, count);

  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {visible.map((book) => (
          <li key={book.id}>
            <ShowcaseBookCard book={book} />
          </li>
        ))}
      </ul>

      {hasMore ? (
        <div
          ref={sentinelRef}
          className="flex h-12 items-center justify-center"
          aria-live="polite"
        >
          <span className="text-sm text-text-variant">
            더 불러오는 중… ({count}/{books.length})
          </span>
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-text-variant" aria-live="polite">
          전체 {books.length}권 표시 완료
        </p>
      )}
    </>
  );
}
