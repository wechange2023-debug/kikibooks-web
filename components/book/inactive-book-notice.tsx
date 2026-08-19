import Link from 'next/link';

import { AttributionBox } from '@/components/book/attribution-box';
import { BookCoverHero } from '@/components/book/book-cover-hero';
import { LIBRARY_PATH } from '@/lib/auth/routes';
import type { AttributionRow } from '@/lib/book/attribution';
import type { Book } from '@/lib/book/detail';
import type { MypageCopy } from '@/lib/mypage/copy';

/**
 * InactiveBookNotice — 비활성 도서(books.is_active = false) 상세 안내 화면.
 *
 * ADR-0063 D2 · O-D5-4(별도 컴포넌트 채택). 종전에는 `notFound()`가 떠서 아이가 막다른
 * 404를 만났다. 그 자리를 이 화면이 대신한다.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 회귀 체크리스트 1번 — AttributionBox 행 비축소 + H1 인접 (CC BY 4.0 법적 의무)
 * ──────────────────────────────────────────────────────────────────────────────
 *   책을 못 읽는 화면이라 해서 어트리뷰션을 줄일 수 없다. **표시 의무는 열람 가능
 *   여부와 무관**하다(license-rules.md §5, Hard Rule 1).
 *
 *   그래서 배치를 상세 페이지(app/(reader)/book/[id]/page.tsx:126-128)와 **동일한
 *   순서로 고정**한다:
 *       BookCoverHero(표지 + H1) → [중간 블록 1개] → AttributionBox
 *   상세는 중간이 BookMeta이고 본 화면은 안내 카드다. H1과 AttributionBox 사이 거리가
 *   승인된 상세 레이아웃과 같으므로 "H1 인접"이 구조적으로 보존된다.
 *
 *   rows는 호출부(page.tsx)가 buildAttributionRows(lib/book/attribution.ts:69)로 만든
 *   **전량**을 그대로 받는다. 본 컴포넌트는 filter·slice를 하지 않는다 — 행 축소 0건.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 다시 읽기 CTA 0건 (ADR-0063 D3 정합)
 * ──────────────────────────────────────────────────────────────────────────────
 *   ReadButton을 렌더하지 않는다. 뷰어 진입은 D3가 라우트에서 막으므로 버튼이 있으면
 *   눌렀다가 되돌아오는 왕복만 생긴다. 링크는 라이브러리 복귀 1개만 둔다.
 *
 * H1은 BookCoverHero가 소유한다(책 제목 = CC BY 4요소 중 "제목"의 단일 출처).
 * 본 컴포넌트의 안내 제목은 h2다 — H1을 2개 만들지 않는다.
 *
 * Server Component — 'use client' 없음. 클라이언트 상태는 BookCoverHero에 한정.
 */

interface InactiveBookNoticeProps {
  book: Book;
  /** buildAttributionRows 결과 **전량**. 호출부가 축소해 넘기면 안 된다. */
  rows: AttributionRow[];
  copy: MypageCopy['inactiveBook'];
}

export function InactiveBookNotice({ book, rows, copy }: InactiveBookNoticeProps) {
  return (
    <main className="min-h-screen bg-surface-2 py-6">
      <div className="mx-auto flex max-w-screen-sm flex-col gap-5 px-4 md:max-w-screen-md md:gap-6 md:px-6 lg:max-w-screen-lg">
        <BookCoverHero book={book} />

        {/* 안내 카드 — 상세의 BookMeta 자리. AttributionBox를 H1에서 밀어내지 않는다. */}
        <section
          aria-label="책 상태 안내"
          className="flex flex-col items-center gap-2 rounded-md bg-surface px-5 py-4 text-center shadow-elev-1"
        >
          <h2 className="break-keep font-display text-body font-semibold text-text">
            {copy.noticeTitle}
          </h2>
          <p className="break-keep text-body text-text-variant">{copy.noticeBody}</p>
        </section>

        {/* 행 축소 0건 — rows를 그대로 전달한다(회귀 체크리스트 1번). */}
        <AttributionBox rows={rows} />

        {/* 라이브러리 복귀 1개. 다시 읽기 버튼은 두지 않는다(D3 정합).
            버튼 토큰은 not-found.tsx의 Primary Button과 동일 — design-system §6.1. */}
        <div className="flex justify-center">
          <Link
            href={LIBRARY_PATH}
            className="inline-flex h-[52px] items-center justify-center rounded-pill bg-primary px-8 text-body font-semibold text-on-primary shadow-elev-2 transition-all duration-200 ease-kiki hover:-translate-y-px hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
          >
            {copy.noticeLibraryLinkLabel}
          </Link>
        </div>
      </div>
    </main>
  );
}
