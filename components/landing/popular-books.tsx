import { BookCoverCard } from '@/components/landing/book-cover-card';
import type { LandingCopy } from '@/lib/landing/copy';
import type { PopularBook } from '@/lib/landing/popular-books';

/**
 * 랜딩 인기 책 섹션 — 헤딩 + 무작위 표지 6장 그리드.
 *
 * 서버 컴포넌트. books는 app/page.tsx가 getPopularBooks()로 받아 props로
 * 내려준다 (매 요청 새로 뽑힌 랜덤 6권 — ADR-0012 결정 3·6).
 * 각 표지 카드는 클라이언트 컴포넌트 BookCoverCard가 렌더한다.
 */
interface PopularBooksProps {
  copy: LandingCopy['popularSection'];
  books: PopularBook[];
}

export function PopularBooks({ copy, books }: PopularBooksProps) {
  return (
    <section className="bg-bg px-5 py-12 sm:py-16">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-2 text-center">
          <h2 className="font-display text-2xl font-semibold text-text">
            {copy.heading}
          </h2>
          <p className="text-sm text-text-variant">{copy.subheading}</p>
        </header>
        {books.length > 0 ? (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
            {books.map((book) => (
              <li key={book.id}>
                <BookCoverCard book={book} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-center text-sm text-text-variant">
            그림책을 준비하고 있어요.
          </p>
        )}
      </div>
    </section>
  );
}
