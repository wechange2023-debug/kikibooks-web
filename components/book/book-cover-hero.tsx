'use client';

import { useState } from 'react';
import Image from 'next/image';
import { BookOpen } from 'lucide-react';

import type { Book } from '@/lib/book/detail';

/**
 * BookCoverHero — 책 상세 상단의 표지 이미지 + H1 제목.
 *
 * ADR-0016 결정 3 "통합 어트리뷰션 단위" 정합:
 *   - <h1>{book.title}</h1>은 CC BY 4.0 법적 4요소 중 "제목"을 충족하는 단일 출처다.
 *     AttributionBox와 DOM·시각 모두 인접 배치되어 "통합 어트리뷰션 단위"를 형성한다.
 *     본 H1을 다른 위치로 옮기거나 두 번째 H1을 도입하면 결정 3 가정이 무너진다 —
 *     phase-14 법무 검토(F9) 영향 범위에 직접 들어간다.
 *
 * 책임 분리 (intent §5.1·§5.2):
 *   - 본 컴포넌트는 표지 + H1만 보유. 메타 칩(레벨·연령·언어)은 형제 컴포넌트
 *     BookMeta가 별도 담당(CP3-a #3). 페이지가 두 컴포넌트를 hero 영역으로 묶어
 *     배치한다(phase-09a/10의 GreetingCard·LevelSelector 형제 배치 패턴 정합).
 *
 * 디자인 인용:
 *   - design-system §6.2 Card — rounded-md + shadow-elev-2
 *   - design-system §2.2 Type Scale — H1은 font-display 24~28px Bold
 *
 * 표지 fallback 패턴 (phase-09a BookCoverCard + phase-10 RecommendationList 정합):
 *   - next/image의 onError로 깨진 표지 감지 → 색상 블록 + BookOpen 아이콘 + 제목
 *   - book.id로 결정적 색상 선택 (같은 책은 항상 같은 fallback 색)
 *   - 팔레트는 WCAG 대비 보장된 container 토큰 쌍 (primary/secondary/tertiary)
 *   - 본 컴포넌트는 hero 표지(큰 영역)라 fallback도 카드 크기에 맞춤 (아이콘 40px·텍스트 base)
 *
 * 성능:
 *   - next/image priority — 책 상세 페이지의 LCP 후보. phase-10 F1 트리거 학습 사전 반영.
 *
 * Client Component — useState(imageError) 필요. book 데이터는 server에서 fetch되어 전달.
 *
 * 의도 문서: docs/intent/screen-03-book-detail.md §5.1
 */

interface BookCoverHeroProps {
  book: Book;
}

/** 깨진 표지 fallback 색 — WCAG 대비 보장된 container 토큰 쌍 (phase-09a 패턴). */
const FALLBACK_PALETTE = [
  { block: 'bg-primary-container', text: 'text-on-primary-container' },
  { block: 'bg-secondary-container', text: 'text-on-secondary-container' },
  { block: 'bg-tertiary-container', text: 'text-on-tertiary-container' },
] as const;

/** book.id로 fallback 색을 결정적으로 고른다 — 같은 책은 항상 같은 색. */
function pickFallbackColor(id: string): (typeof FALLBACK_PALETTE)[number] {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) {
    sum += id.charCodeAt(i);
  }
  return FALLBACK_PALETTE[sum % FALLBACK_PALETTE.length];
}

export function BookCoverHero({ book }: BookCoverHeroProps) {
  const [imageError, setImageError] = useState(false);
  const fallback = pickFallbackColor(book.id);

  return (
    <header className="flex flex-col gap-4">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-md bg-surface-3 shadow-elev-2 sm:max-w-sm">
        {imageError ? (
          <div
            className={`flex h-full w-full flex-col items-center justify-center gap-3 p-4 ${fallback.block}`}
          >
            <BookOpen
              className={`h-10 w-10 ${fallback.text}`}
              aria-hidden="true"
            />
            <p
              className={`line-clamp-4 text-center text-base font-semibold ${fallback.text}`}
            >
              {book.title}
            </p>
          </div>
        ) : (
          <Image
            src={book.cover_url}
            alt={`${book.title} 표지`}
            fill
            sizes="(max-width: 640px) 80vw, 320px"
            priority
            className="object-cover"
            onError={() => setImageError(true)}
          />
        )}
      </div>
      <h1 className="break-keep text-center font-display text-2xl font-bold text-text sm:text-3xl">
        {book.title}
      </h1>
    </header>
  );
}
