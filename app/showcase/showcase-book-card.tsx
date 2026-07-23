'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BookOpen, Headphones } from 'lucide-react';

import type { PopularBook } from '@/lib/landing/popular-books';

/**
 * /showcase 책 카드 1장 (임시 시연용, 격리).
 *
 * 재사용 가능한 /book 링크 카드가 없어 신규 정의한다:
 *   - BookCoverCard(components/landing): href='/signup' 하드코딩 → 시연 부적합.
 *   - LibraryBookCard(components/library/library-browser): 내부 정의(비 export).
 * 두 카드 모두 재사용 불가라, LibraryBookCard의 검증된 마크업을 그대로 인용해
 * href만 `/book/[id]`로 둔다(새 뷰어·새 디자인 만들지 않음 — 작업지시서 §3).
 *
 * 'use client' 이유: next/image onError로 깨진 표지를 제목+색블록 fallback으로 대체
 * (BookCoverCard·LibraryBookCard와 동일 표준 팔레트).
 */

const FALLBACK_PALETTE = [
  { block: 'bg-primary-container', text: 'text-on-primary-container' },
  { block: 'bg-secondary-container', text: 'text-on-secondary-container' },
  { block: 'bg-tertiary-container', text: 'text-on-tertiary-container' },
] as const;

function pickFallbackColor(id: string): (typeof FALLBACK_PALETTE)[number] {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) {
    sum += id.charCodeAt(i);
  }
  return FALLBACK_PALETTE[sum % FALLBACK_PALETTE.length];
}

export function ShowcaseBookCard({ book }: { book: PopularBook }) {
  const [imageError, setImageError] = useState(false);
  const fallback = pickFallbackColor(book.id);

  return (
    <Link
      href={`/book/${book.id}`}
      prefetch={false}
      className="group flex flex-col gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-surface-3 shadow-elev-1 transition-transform duration-200 ease-kiki group-hover:-translate-y-1">
        {imageError ? (
          <div
            className={`flex h-full w-full flex-col items-center justify-center gap-2 p-3 ${fallback.block}`}
          >
            <BookOpen className={`h-7 w-7 ${fallback.text}`} aria-hidden="true" />
            <p
              className={`line-clamp-4 text-center text-sm font-semibold ${fallback.text}`}
            >
              {book.title}
            </p>
          </div>
        ) : (
          <Image
            src={book.coverUrl}
            alt={`${book.title} 표지`}
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 768px) 30vw, (max-width: 1024px) 22vw, 16vw"
            className="object-cover"
            onError={() => setImageError(true)}
          />
        )}
        {/* 오디오 지원 배지 (Phase F) — hasAudio=true인 책만. BookCoverCard와 동일 pill. */}
        {book.hasAudio ? (
          <span
            role="img"
            aria-label="오디오 지원"
            className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-pill border border-outline bg-surface text-primary shadow-elev-1"
          >
            <Headphones className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="line-clamp-2 text-sm font-semibold text-text">{book.title}</p>
        {book.author ? (
          <p className="line-clamp-1 text-xs text-text-variant">{book.author}</p>
        ) : null}
      </div>
    </Link>
  );
}
