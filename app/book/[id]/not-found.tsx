import Link from 'next/link';

import { POST_LOGIN_PATH } from '@/lib/auth/routes';
import { getBookDetailCopy } from '@/lib/book/copy';

/**
 * /book/[id]/not-found.tsx — 책 상세 페이지 공통 404.
 *
 * 4 케이스 모두 동일 UX (intent §5.5, 사용자에게 사유 구분 미노출 — 보안·일관성):
 *   1. params.id UUID 형식 불일치 (page.tsx 가드 1)
 *   2. ADR-0014 Amendment #4 블랙리스트 4 UUID (page.tsx 가드 3)
 *   3. books 행 NULL (없음·is_active=false·RLS 차단 — page.tsx 가드 4)
 *   4. 그 외 next/navigation notFound() 호출 케이스
 *
 * 디자인 인용:
 *   - 카드: design-system §6.2 정보 카드 — rounded-md + bg-surface + shadow-elev-1
 *   - 홈 링크: design-system §6.1 Primary Button (ReadButton과 동일 토큰)
 *
 * 라우팅: POST_LOGIN_PATH(/home)으로 복귀. 본 404는 미들웨어 인증 가드 통과 후
 *   렌더되므로 사용자는 인증 상태 — /home 복귀가 자연.
 *
 * Server Component. copy는 lib/book/copy.ts 단일 출처 (ADR-0012 결정 2).
 */

export default async function BookNotFound() {
  const copy = await getBookDetailCopy();

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-2 px-4 py-10">
      <section
        aria-labelledby="book-not-found-title"
        className="flex w-full max-w-md flex-col items-center gap-4 rounded-md bg-surface px-6 py-10 text-center shadow-elev-1"
      >
        <h1
          id="book-not-found-title"
          className="font-display text-2xl font-bold text-text"
        >
          {copy.notFound.title}
        </h1>
        <p className="break-keep text-base text-text-variant">
          {copy.notFound.body}
        </p>
        <Link
          href={POST_LOGIN_PATH}
          className="inline-flex h-[52px] items-center justify-center rounded-pill bg-primary px-8 text-base font-semibold text-on-primary shadow-elev-pop transition-all duration-200 ease-kiki hover:-translate-y-px hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
        >
          {copy.notFound.homeLinkLabel}
        </Link>
      </section>
    </main>
  );
}
