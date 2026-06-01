'use client';

import { useEffect } from 'react';

import './globals.css';

/**
 * app/global-error.tsx — 루트 에러 경계 (phase-14 CP3-a #13 해소).
 *
 * Next.js 14 App Router 규약:
 *   - global-error는 root layout(app/layout.tsx) 자체의 에러를 포착한다 → layout을 대체하므로
 *     자체 <html>/<body>를 렌더해야 한다.
 *   - error 경계는 'use client' 필수. props 시그니처 { error, reset } 표준.
 *   - layout 대체로 next/font variable(--font-display·--font-body) 미적용 →
 *     font-body는 시스템 폴백으로 degrade(최후 경계라 허용, B-1 결정). globals.css import로
 *     Tailwind semantic 토큰(bg-surface-2 등)은 정상 작동(Hard Rule 10 유지).
 *
 * 자기완결(self-contained) 원칙:
 *   - 에러 경계는 copy 모듈(lib/admin/copy.ts 등)이 에러원일 수 있어 외부 의존 0건으로 둔다.
 *     라벨은 한국어 인라인 하드코딩(자기완결, CP3 spec "인라인" 허용 직역).
 *   - 로깅은 console.error만(A-1 결정). 외부 모니터링(Sentry 등) 통합 0건.
 *
 * 디자인 직역: app/book/[id]/not-found.tsx 카드 패턴 100% 정합
 *   (design-system §6.2 정보 카드 + §6.1 Primary Button). 신규 토큰·raw HEX 0건.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ko">
      <body className="font-body">
        <main className="flex min-h-screen items-center justify-center bg-surface-2 px-4 py-10">
          <section
            aria-labelledby="global-error-title"
            className="flex w-full max-w-md flex-col items-center gap-4 rounded-md bg-surface px-6 py-10 text-center shadow-elev-1"
          >
            <h1
              id="global-error-title"
              className="font-display text-2xl font-bold text-text"
            >
              문제가 발생했어요
            </h1>
            <p className="break-keep text-base text-text-variant">
              잠시 후 다시 시도해 주세요. 문제가 계속되면 잠시 뒤에 다시 방문해 주세요.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex h-[52px] items-center justify-center rounded-pill bg-primary px-8 text-base font-semibold text-on-primary shadow-elev-pop transition-all duration-200 ease-kiki hover:-translate-y-px hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
            >
              다시 시도
            </button>
            <a
              href="/"
              className="text-sm font-medium text-text-variant underline-offset-2 transition-colors hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              홈으로
            </a>
            {error.digest ? (
              <p className="text-xs text-text-variant/70">오류 코드: {error.digest}</p>
            ) : null}
          </section>
        </main>
      </body>
    </html>
  );
}
