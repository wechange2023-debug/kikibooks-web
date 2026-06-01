'use client';

import { useEffect } from 'react';

/**
 * app/admin/error.tsx — admin 세그먼트 에러 경계 (phase-14 CP3-b #13 해소).
 *
 * Next.js 14 App Router 규약:
 *   - admin 세그먼트(/admin·/admin/books·/admin/users) 페이지 에러를 포착한다.
 *   - 에러 경계는 layout(app/admin/layout.tsx) 하위에 중첩 → admin layout의 header+nav는
 *     유지되고 본 컴포넌트가 {children} 위치에 렌더된다. 따라서 <html>/<body> 0건,
 *     <section> 카드만 렌더(global-error와 분리).
 *   - layout 자체 에러(requireAdmin 등)는 본 경계가 포착하지 못하고 global-error로 버블.
 *   - 'use client' 필수. props 시그니처 { error, reset } 표준.
 *
 * 자기완결(self-contained) 원칙:
 *   - copy 모듈(lib/admin/copy.ts) 미수정 — 에러원 격리 위해 라벨 한국어 인라인 하드코딩.
 *   - 로깅 console.error만(A-1 결정). 외부 모니터링 통합 0건.
 *
 * 디자인 직역: app/book/[id]/not-found.tsx 카드 패턴 정합 (design-system §6.2·§6.1).
 *   admin 톤 — 운영자 화면이라 "오류가 발생했습니다"·"재시도" 직설 표현. 신규 토큰·raw HEX 0건.
 */
export default function AdminError({
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
    <section
      aria-labelledby="admin-error-title"
      className="flex flex-col items-center gap-4 rounded-md bg-surface px-6 py-10 text-center shadow-elev-1"
    >
      <h1
        id="admin-error-title"
        className="font-display text-2xl font-bold text-text"
      >
        오류가 발생했습니다
      </h1>
      <p className="break-keep text-base text-text-variant">
        관리 화면을 불러오는 중 문제가 발생했습니다. 재시도하거나 잠시 후 다시 시도해 주세요.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="inline-flex h-[52px] items-center justify-center rounded-pill bg-primary px-8 text-base font-semibold text-on-primary shadow-elev-pop transition-all duration-200 ease-kiki hover:-translate-y-px hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
      >
        재시도
      </button>
      {error.digest ? (
        <p className="text-xs text-text-variant/70">오류 코드: {error.digest}</p>
      ) : null}
    </section>
  );
}
