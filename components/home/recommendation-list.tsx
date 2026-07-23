'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BookOpen, Headphones } from 'lucide-react';

import type { HomeCopy } from '@/lib/home/copy';
import type { PopularBook } from '@/lib/landing/popular-books';
import type { RecommendationResult } from '@/lib/home/recommendations';

/**
 * 오늘의 추천 5권 — 자녀의 current_level 기준 미독 책 가로 스크롤.
 *
 * 책임: lib/home/recommendations.ts의 RecommendationResult를 카드 줄로 표시.
 * fallbackStage가 5이면 빈 상태 폴백, 그 외(1~4)는 동일하게 책 카드 표시
 * (intent §5.2 — 폴백 단계는 사용자에게 별도 알림 없이 자연스럽게).
 *
 * 디자인 인용:
 *   - design-system §6.2 정보 카드 — shadow-elev-1 + rounded-md + hover translateY
 *   - design-system §3 카드 간 gap-4 — 가로 스크롤 카드 간격
 *
 * D12 (cp3_decisions): 전체 'use client' 통일.
 *   - next/image onError로 깨진 표지 fallback 처리
 *   - landing의 BookCoverCard 재사용 안 함 — href='/signup' 하드코딩으로 홈 부적합
 *     (intent §5.2 phase-10에서 카드 클릭 비활성)
 *   - 홈 전용 카드 마크업 인라인. 표지 fallback 패턴은 BookCoverCard에서 차용
 *
 * D11/cp3 패턴: 깨진 표지 fallback 컬러는 정적 객체 배열로 박제(동적 클래스 회피).
 *
 * Client Component — useState(imageError) 필요. props.result는 server에서 fetch되어 전달.
 */

interface RecommendationListProps {
  result: RecommendationResult;
  copy: HomeCopy['recommendations'];
}

/** 깨진 표지 fallback 색 — WCAG 대비 보장된 container 토큰 쌍. */
const FALLBACK_PALETTE = [
  { block: 'bg-primary-container', text: 'text-on-primary-container' },
  { block: 'bg-secondary-container', text: 'text-on-secondary-container' },
  { block: 'bg-tertiary-container', text: 'text-on-tertiary-container' },
] as const;

/** book.id 합으로 fallback 색을 결정 — 같은 책은 항상 같은 색. */
function pickFallbackColor(id: string): (typeof FALLBACK_PALETTE)[number] {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) {
    sum += id.charCodeAt(i);
  }
  return FALLBACK_PALETTE[sum % FALLBACK_PALETTE.length];
}

/**
 * 책 카드 1장. 표지 + 제목 + 저자 캡션 (ADR-0013 §3).
 *
 * 클릭 → /book/[id] 책 상세. phase-12 CP3-a-6에서 활성화 — book.id href 박제.
 * (phase-10 클릭 비활성 → intent screen-02-home L204가 phase-11에 활성화를 배정했으나
 *  phase-11 spec이 미이월 → intent↔spec 갭 정정, F18 박제.) BookCoverCard Link 패턴 정합:
 *  group + focus-ring + cover group-hover translateY(design-system §6.2 hover 인용 충족).
 *  prefetch={false} — 추천 5권 동시 prefetch 네트워크 부담 회피, 클릭 시 fetch로 충분.
 */
function RecommendationCard({ book }: { book: PopularBook }) {
  const [imageError, setImageError] = useState(false);
  const fallback = pickFallbackColor(book.id);

  return (
    <Link
      href={`/book/${book.id}`}
      prefetch={false}
      className="group flex w-32 shrink-0 flex-col gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 sm:w-36"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-surface-3 shadow-elev-1 transition-transform duration-200 ease-kiki group-hover:-translate-y-1">
        {imageError ? (
          <div
            className={`flex h-full w-full flex-col items-center justify-center gap-2 p-3 ${fallback.block}`}
          >
            <BookOpen
              className={`h-6 w-6 ${fallback.text}`}
              aria-hidden="true"
            />
            <p
              className={`line-clamp-4 text-center text-xs font-semibold ${fallback.text}`}
            >
              {book.title}
            </p>
          </div>
        ) : (
          <Image
            src={book.coverUrl}
            alt={`${book.title} 표지`}
            fill
            sizes="(max-width: 640px) 35vw, 160px"
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

export function RecommendationList({ result, copy }: RecommendationListProps) {
  const { books, fallbackStage } = result;
  const isEmpty = fallbackStage === 5 || books.length === 0;

  return (
    <section
      aria-label={copy.title}
      className="flex flex-col gap-3 rounded-md bg-surface p-5 shadow-elev-1"
    >
      <h2 className="font-display text-base font-semibold text-text">{copy.title}</h2>

      {isEmpty ? (
        <p className="rounded-md border border-outline bg-surface-2 px-4 py-3 text-sm text-text-variant">
          {copy.empty}
        </p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin] sm:gap-5">
          {books.map((book) => (
            <RecommendationCard key={book.id} book={book} />
          ))}
        </div>
      )}
    </section>
  );
}
