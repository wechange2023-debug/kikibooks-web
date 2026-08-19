'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';

import type { PopularBook } from '@/lib/landing/popular-books';

/**
 * 홈 히어로 우측 표지 연출 — 상위 2~3권을 겹쳐·기울여 배치한다.
 *
 * 레퍼런스(Bookory) 히어로 구도 이식. 딥 그린 히어로 바탕 위에 **크림 패널**을 깔고
 * 그 위에 표지를 얹는다 — 표지 색이 무엇이든 배경과 분리돼 읽힌다.
 *
 * 데이터 (신규 쿼리 0건):
 *   `getRecommendations()`가 이미 가져온 `RecommendationResult.books`를 HomeHero가
 *   상위 3권만 잘라 props로 내려준다. 추천 캐러셀과 **같은 배열**을 재사용하므로
 *   왕복이 늘지 않는다.
 *
 * 링크 (지시 2): 표지 클릭 → `/book/[id]` 책 상세. 추천 카드와 동일 동선이다.
 *   ★ 표지 링크는 CTA로 치지 않는다(§6.1 "화면당 CTA 1개"). CTA는 색·고도로
 *     정의되는 버튼(`bg-cta` + `shadow-elev-cta`)이며, 여기 표지는 콘텐츠 링크다.
 *     /home의 CTA는 여전히 히어로의 "책 보러 가기" 1개뿐이다.
 *
 * 표지 폴백 (§7.3 — 변경 불가 항목):
 *   `onError` → 색 블록 + BookOpen + 제목. `book.id` 기반 결정적 색 선택.
 *   **폴백 시에도 카드 박스(aspect-[3/4])는 그대로라 레이아웃이 흔들리지 않는다.**
 *   팔레트는 level container + `text-text` 조합(대비 13.3~14.5:1, §1.7 규칙 2).
 *
 * 반응형 (지시 1 — 390px):
 *   부모(HomeHero)가 `flex-col md:flex-row`라 모바일에서는 텍스트 **아래**로 내려온다.
 *   카드 폭도 모바일 20(80px) → md 28(112px)로 줄인다. CTA 터치 타깃은 부모가 h-[52px]로
 *   유지하므로 §6.5 하한 44px에 영향이 없다.
 *
 * 동적 클래스 회피(D11 패턴): 기울기·겹침 클래스를 인덱스별 정적 배열로 박제한다 —
 *   Tailwind content 스캐너는 문자열 조합을 인식하지 못한다.
 *
 * Client Component — useState(imageError) 필요.
 */

interface HeroCoverStackProps {
  books: PopularBook[];
}

/** 깨진 표지 fallback 색 — §1.9 통과 조합(container + text). */
const FALLBACK_PALETTE = [
  { block: 'bg-level-1-container', text: 'text-text' },
  { block: 'bg-level-3-container', text: 'text-text' },
  { block: 'bg-level-5-container', text: 'text-text' },
] as const;

function pickFallbackColor(id: string): (typeof FALLBACK_PALETTE)[number] {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) {
    sum += id.charCodeAt(i);
  }
  return FALLBACK_PALETTE[sum % FALLBACK_PALETTE.length];
}

/** 인덱스별 기울기·겹침 정적 매핑 (최대 3장). */
const STACK_CLASSES = [
  '-rotate-6 z-[1]',
  'rotate-2 -ml-4 z-[2] sm:-ml-5',
  'rotate-[9deg] -ml-4 z-[3] sm:-ml-5',
] as const;

function HeroCover({ book, index }: { book: PopularBook; index: number }) {
  const [imageError, setImageError] = useState(false);
  const fallback = pickFallbackColor(book.id);

  return (
    <Link
      href={`/book/${book.id}`}
      prefetch={false}
      aria-label={book.title}
      className={`group block w-20 shrink-0 outline-none transition-transform duration-200 ease-kiki hover:-translate-y-1 hover:rotate-0 focus-visible:ring-2 focus-visible:ring-cta focus-visible:ring-offset-2 motion-reduce:transition-none sm:w-28 ${STACK_CLASSES[index]}`}
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-sm bg-surface-3 shadow-elev-2">
        {imageError ? (
          <div
            className={`flex h-full w-full flex-col items-center justify-center gap-1 p-2 ${fallback.block}`}
          >
            <BookOpen className={`h-5 w-5 ${fallback.text}`} aria-hidden="true" />
            <p
              className={`line-clamp-3 text-center text-caption font-semibold ${fallback.text}`}
            >
              {book.title}
            </p>
          </div>
        ) : (
          <Image
            src={book.coverUrl}
            alt={`${book.title} 표지`}
            fill
            sizes="(max-width: 640px) 80px, 112px"
            className="object-cover"
            onError={() => setImageError(true)}
          />
        )}
      </div>
    </Link>
  );
}

export function HeroCoverStack({ books }: HeroCoverStackProps) {
  const top = books.slice(0, 3);

  // 추천이 비어 있으면(fallbackStage 5) 패널 자체를 렌더하지 않는다 — 빈 크림 상자만
  // 남으면 오히려 깨져 보인다. 이때 히어로는 텍스트 전폭 레이아웃이 된다.
  if (top.length === 0) {
    return null;
  }

  return (
    <div
      className="w-full shrink-0 rounded-lg bg-surface-2 px-4 py-5 shadow-elev-1 md:w-auto"
      aria-label="오늘의 추천 표지"
    >
      <div className="flex items-center justify-center">
        {top.map((book, index) => (
          <HeroCover key={book.id} book={book} index={index} />
        ))}
      </div>
    </div>
  );
}
