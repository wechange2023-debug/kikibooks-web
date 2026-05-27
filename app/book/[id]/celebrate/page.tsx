import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { ONBOARDING_PATH, SIGN_IN_PATH } from '@/lib/auth/routes';
import { getBookReaderCopy } from '@/lib/book/copy';
import { getBookById } from '@/lib/book/detail';
import { getActiveChild } from '@/lib/home/active-child';
import { createClient } from '@/lib/supabase/server';

/**
 * /book/[id]/celebrate — Screen 05 완독 축하 (phase-12 minimal placeholder).
 *
 * FinishButton 클릭 → completeReadingSession이 reading_sessions를 UPDATE한 뒤 본
 * 페이지로 redirect한다(intent §5.3·§5.4). phase-12 단독 베타 검수에서 "완독 흐름이
 * 끝까지 작동한다"는 신호를 사용자에게 준다.
 *
 * ⚠️ phase-13 경계 (ADR-0017 D7·d9 — 본 페이지는 placeholder):
 *   별 3개 SVG 애니메이션(design-system §7.3)·children.points += 50·child_badges
 *   INSERT·이어보기 추천은 모두 phase-13 전속이다. 본 페이지는 헤더 + 1줄 + /library
 *   버튼만 렌더하고, children·child_badges 테이블 쓰기는 0건이다(이중 구현 방지).
 *
 * 가드 4종 (옵션 P — app/book/[id]/read/page.tsx CP3-a-5 패턴 정합):
 *   1. params.id UUID 형식 불일치 → notFound (DB 호출 방지)
 *   2. 미인증 → redirect(/login) (미들웨어 1차, 본 페이지 2차 안전망)
 *   3. 자녀 0명 → redirect(/onboarding) (app/home/page.tsx d4 패턴 — 자녀명이 축하
 *      문구에 필요하므로 자녀 해소를 가드로 둔다. read/page의 블랙리스트 가드는 iframe
 *      미로드 페이지라 불필요 → 자녀 가드로 대체)
 *   4. books 행 NULL (없음·is_active=false·RLS 차단) → notFound
 *
 * 카피 (spec d13 + intent §5.4):
 *   getBookReaderCopy().celebrate — title(정적 헤더) + buildSubtitle(자녀명·책제목
 *   동적 문장) + libraryLinkLabel(단일 버튼 '다른 책 보러 가기' → /library).
 *   buildSubtitle은 server-only 모듈(copy.ts)에서 **서버에서만 평가**되고 결과 문자열만
 *   렌더되므로 client 직렬화 문제가 0건이다(정적 상수 패턴의 유일한 함수 예외).
 *
 * Cache 정책: export const dynamic = 'force-dynamic' (intent §6 — 자녀명·책 제목 매번
 *   fresh, read/page·home 정합). Metadata robots noindex (ADR-0013 결정 4 closed
 *   environment, app/robots.ts '/book' disallow와 정합).
 *
 * Server Component — 가드·fetch·조립만. 인터랙션 0건('use client' 없음).
 *
 * 의도 문서: docs/intent/screen-04-reader.md §5.4·§6
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '완독 축하 · 키키북스',
  robots: { index: false, follow: false },
};

/** 표준 UUID 형식 (read/page.tsx와 동일 — 옵션 P 복사). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** phase-13에서 정식 구현되는 라이브러리 경로(현재 PROTECTED_PREFIXES에 등록만). */
const LIBRARY_PATH = '/library';

interface CelebratePageProps {
  params: { id: string };
}

export default async function CelebratePage({ params }: CelebratePageProps) {
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

  // 3-fetch 병렬 — book + child + copy 의존성 없음 (read/page.tsx 패턴 정합)
  const [book, child, readerCopy] = await Promise.all([
    getBookById(supabase, params.id),
    getActiveChild(supabase, user.id),
    getBookReaderCopy(),
  ]);

  // 가드 4: books 행 NULL → notFound
  if (!book) {
    notFound();
  }

  // 가드 3: 자녀 0명 → 온보딩 (app/home/page.tsx d4 패턴 — 축하 문구에 자녀명 필요)
  if (!child) {
    redirect(ONBOARDING_PATH);
  }

  const { celebrate } = readerCopy;
  // buildSubtitle은 server-only(copy.ts)에서만 평가 — 결과 문자열만 렌더된다.
  const subtitle = celebrate.buildSubtitle(child.name, book.title);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-surface-2 px-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <h1 className="font-display text-3xl font-bold text-text">{celebrate.title}</h1>
        <p className="text-base text-text-variant">{subtitle}</p>
      </div>

      {/*
        phase-13 전속 placeholder 자리 (ADR-0017 D7·d9 — 본 phase-12는 쓰기 0건):
          - 별 3개 SVG 애니메이션 (design-system §7.3 Celebrate 모션)
          - children.points += 50 반영
          - child_badges INSERT (완독 배지 획득)
          - '이어서 추천 책' 카드 등 후속 동선
      */}

      <Link
        href={LIBRARY_PATH}
        className="inline-flex h-[52px] items-center justify-center gap-2 rounded-pill bg-primary px-8 text-base font-semibold text-on-primary shadow-elev-pop transition-all duration-200 ease-kiki hover:-translate-y-px hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
      >
        {celebrate.libraryLinkLabel}
      </Link>
    </main>
  );
}
