'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BookOpen, Headphones } from 'lucide-react';

import type { PopularBook } from '@/lib/landing/popular-books';

/**
 * 표지 카드 1장 — 표지 이미지 + 제목·저자 캡션. 클릭 시 /signup.
 *
 * 클라이언트 컴포넌트인 이유: next/image의 onError로 깨진 표지 URL을 감지해
 * fallback으로 대체하기 위함이다 (플랜 §F-1).
 *
 * fallback (phase-09a CP3 — ADR-0012 결정 6 보강):
 *  - 깨진 표지는 '책 제목 + 색상 블록'으로 대체한다. 책 아이콘만 두면 어떤
 *    책인지 알 수 없다 — phase-09b(GDL 표지 정정) 완료 전까지 phase-10·13에서
 *    fallback이 노출될 수 있으므로 제목을 보여 인지 가능하게 한다.
 *  - 블록 색은 WCAG 대비가 보장된 container 토큰 쌍(primary/secondary/tertiary
 *    -container + on-*-container)을 book.id로 결정적으로 골라 카드마다 다르게 한다.
 *
 * 캡션 (ADR-0013 결정 1):
 *  - 제목은 항상 표시.
 *  - 저자는 있을 때만 표시 — books.author는 nullable이고 활성 책의 60%가
 *    NULL이라 카드마다 1줄/2줄이 섞이는 것은 정상이다 (ADR-0013 결정 1 실측 보강).
 *
 * PopularBook 타입은 lib/landing/popular-books.ts에서 그대로 가져온다
 * (`import type` — 타입 전용이라 server-only 모듈이어도 클라이언트에서 안전).
 */
interface BookCoverCardProps {
  book: PopularBook;
  /**
   * 로그인 여부 — 링크 대상을 가른다 (ADR-0062 **Amendment 1** 부수 결정 2).
   *
   * v1에서는 `href="/signup"`이 하드코딩돼 있었다(랜딩 전용 컴포넌트였기 때문).
   * Amendment 1로 로그인 메인에도 인기 책 섹션이 들어가면서, 로그인 사용자는
   * 책 상세로 바로 갈 수 있어야 한다. `CategoryCarousel`의 O-M2 분기와 같은 패턴이다.
   */
  signedIn: boolean;
}

/** 깨진 표지 fallback 색 — WCAG 대비가 보장된 container 토큰 쌍. */
const FALLBACK_PALETTE = [
  { block: 'bg-level-1-container', text: 'text-text' },
  { block: 'bg-level-3-container', text: 'text-text' },
  { block: 'bg-level-5-container', text: 'text-text' },
] as const;

/** book.id로 fallback 색을 결정적으로 고른다 — 같은 책은 항상 같은 색. */
function pickFallbackColor(id: string): (typeof FALLBACK_PALETTE)[number] {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) {
    sum += id.charCodeAt(i);
  }
  return FALLBACK_PALETTE[sum % FALLBACK_PALETTE.length];
}

export function BookCoverCard({ book, signedIn }: BookCoverCardProps) {
  const [imageError, setImageError] = useState(false);
  const fallback = pickFallbackColor(book.id);

  return (
    <Link
      href={signedIn ? `/book/${book.id}` : '/signup'}
      prefetch={false}
      className="group flex flex-col gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-surface-3 shadow-elev-1 transition-transform duration-200 ease-kiki group-hover:-translate-y-1">
        {imageError ? (
          <div
            className={`flex h-full w-full flex-col items-center justify-center gap-2 p-3 ${fallback.block}`}
          >
            <BookOpen
              className={`h-7 w-7 ${fallback.text}`}
              aria-hidden="true"
            />
            <p
              className={`line-clamp-4 text-center text-label font-semibold ${fallback.text}`}
            >
              {book.title}
            </p>
          </div>
        ) : (
          <Image
            src={book.coverUrl}
            alt={`${book.title} 표지`}
            fill
            sizes="(max-width: 640px) 45vw, 200px"
            className="object-cover"
            onError={() => setImageError(true)}
          />
        )}
        {/* 오디오 지원 배지 (Phase F) — hasAudio=true인 책만. 표지 우상단 작은 pill.
            3~7세 대상이라 텍스트 없이 아이콘만, aria-label로 접근성 확보.
            톤은 리더 포지션 pill(audio-reader.tsx)과 일치: border-outline + bg-surface + shadow-elev-1. */}
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
        <p className="line-clamp-2 text-label font-semibold text-text">
          {book.title}
        </p>
        {book.author ? (
          <p className="line-clamp-1 text-caption text-text-variant">
            {book.author}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
