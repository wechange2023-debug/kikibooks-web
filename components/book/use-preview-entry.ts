'use client';

import { useSearchParams } from 'next/navigation';

import { PREVIEW_PARAM, isPreviewParamValue } from '@/lib/book/preview-mode';

/**
 * 리더 3종(html·audio·asb) 공용 — 현재 진입이 관리자 미리보기(`?preview=1`)인가.
 *
 * 세 리더가 같은 판별을 각자 복붙하지 않도록 훅 1개로 모은다. 판별 규칙 자체는
 * lib/book/preview-mode.ts가 소유하며(server action도 같은 규칙을 쓴다), 본 훅은
 * 그 규칙에 클라이언트의 현재 URL을 물려주는 얇은 층이다.
 *
 * 파일이 분리된 이유: 본 훅은 'use client' 경계에 속하지만 preview-mode.ts는
 * server action에서도 import하므로 React 의존이 있으면 안 된다.
 *
 * Suspense: useSearchParams는 정적 프리렌더 시 Suspense 경계를 요구하나,
 * 리더 라우트는 `export const dynamic = 'force-dynamic'`
 * (app/(reader)/book/[id]/read/page.tsx:66)이라 프리렌더 대상이 아니다.
 */
export function usePreviewEntry(): boolean {
  const searchParams = useSearchParams();
  return isPreviewParamValue(searchParams.get(PREVIEW_PARAM));
}
