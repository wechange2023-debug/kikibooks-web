import { SectionHeader } from '@/components/ui/section-header';
import { BookCoverCard } from '@/components/landing/book-cover-card';
import type { LandingCopy } from '@/lib/landing/copy';
import type { PopularBook } from '@/lib/landing/popular-books';

/**
 * 인기 책 섹션 — 헤딩 + 무작위 표지 6장 그리드.
 *
 * ADR-0062 Amendment 1 — 비로그인 랜딩뿐 아니라 **로그인 메인에서도** 렌더된다.
 * 로그인 상태에서 "오늘의 추천"과 책이 겹칠 수 있으나 **겹침 제거는 하지 않는다**
 * (추천 로직 변경은 큐 D-5 이후 별건, 이번은 표시만 — Amd.1 부수 결정 3).
 *
 * 서버 컴포넌트. books는 app/page.tsx가 getPopularBooks()로 받아 props로
 * 내려준다 (매 요청 새로 뽑힌 랜덤 6권 — ADR-0012 결정 3·6).
 * 각 표지 카드는 클라이언트 컴포넌트 BookCoverCard가 렌더한다.
 */
interface PopularBooksProps {
  copy: LandingCopy['popularSection'];
  books: PopularBook[];
  /** 카드 링크 분기 — 로그인 `/book/[id]` · 비로그인 `/signup` (ADR-0062 Amd.1). */
  signedIn: boolean;
}

export function PopularBooks({ copy, books, signedIn }: PopularBooksProps) {
  return (
    <section className="bg-bg px-5 py-12 sm:py-16">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {/*
          §6.3 섹션 헤더 패턴 — 좌측 타이틀 + (우측 pill). 랜딩은 비로그인 화면이라
          "전체 보기" 대상이 없으므로 href를 주지 않는다(§6.4의 캐러셀 대체 경로
          요구는 가로 스크롤 섹션에만 걸린다 — 이 섹션은 그리드다).
        */}
        <header className="flex flex-col gap-2">
          <SectionHeader title={copy.heading} />
          <p className="text-label text-text-variant">{copy.subheading}</p>
        </header>
        {books.length > 0 ? (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
            {books.map((book) => (
              <li key={book.id}>
                <BookCoverCard book={book} signedIn={signedIn} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-center text-label text-text-variant">
            그림책을 준비하고 있어요.
          </p>
        )}
      </div>
    </section>
  );
}
