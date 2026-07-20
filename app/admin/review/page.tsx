import type { Metadata } from 'next';

import { ReviewListView } from '@/components/admin/review/review-list-view';
import { getReviewBookList } from '@/lib/admin/review/query';

/**
 * /admin/review — 검수 대상 책 목록 (ADR-0051 구현 1, 구현 3-b에서 렌더 분리).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용
 * ──────────────────────────────────────────────────────────────────────────────
 *   - ADR-0051 D1: /admin/review = 책 목록(status 신호등 포함) → 행 클릭 시
 *     /admin/review/[bookId] 상세로 이동. status는 책 단위.
 *   - ADR-0051 D5 + ADR-0019 D16: app/admin/layout.tsx의 requireAdmin 1중 가드를 상속한다.
 *     본 페이지는 requireAdmin 재호출 0건 — Next.js layout이 페이지 도달 전 실행을 보증.
 *   - ADR-0019 D12: force-dynamic + robots noindex는 layout 상속. 본 페이지는 title만 override.
 *
 * 책임 분리 (구현 3-b):
 *   - 본 Server Component: 가드 신뢰 + 초기 fetch + ReviewListView 조립.
 *   - ReviewListView ('use client'): 시범 코호트 토글·필터·정렬 등 상호작용 전부.
 *     구현 1에서는 상호작용이 0건이라 본 파일이 직접 렌더했으나, 토글 도입으로 분리했다
 *     (app/admin/books/page.tsx → AdminBooksBrowser 패턴 정합).
 *   - 조회는 152권 전건 그대로 — 필터·정렬은 화면단 책임이라 query.ts 시그니처 불변.
 *
 * 카피 단일 출처 미적용:
 *   - ADR-0019 D23의 lib/admin/copy.ts는 AdminCopy 인터페이스 고정 7섹션이라 review
 *     섹션 추가 = copy.ts 수정이 선결이다. 한국어 라벨은 컴포넌트 내 상수로 두고
 *     copy.ts 편입은 백로그 유지.
 *
 * ADR: docs/adr/0051-admin-review-screen.md D1·D3·D4·D5
 * 패턴 정합: app/admin/books/page.tsx (layout 가드 1중 신뢰 + title override + Browser 조립)
 */

export const metadata: Metadata = {
  title: '텍스트 검수 · 키키북스',
};

export default async function AdminReviewPage() {
  // ADR-0019 D16 — requireAdmin 재호출 0건(layout 보증). 진입 = admin·curator 통과 자격.
  const rows = await getReviewBookList();

  return <ReviewListView rows={rows} />;
}
