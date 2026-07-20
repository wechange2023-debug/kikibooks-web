import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ReviewDetailView } from '@/components/admin/review/review-detail-view';
import { getReviewBookDetail } from '@/lib/admin/review/query';

/**
 * /admin/review/[bookId] — 책별 검수 상세 (ADR-0051 구현 1).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용
 * ──────────────────────────────────────────────────────────────────────────────
 *   - ADR-0051 D1: 페이지를 세로로 나열하고 각 행 = [좌: 이미지 | 우: text]. 세로 나열이라야
 *     페이지 경계를 넘는 읽기순서 오류가 잡힌다. 렌더 책임은 ReviewDetailView.
 *   - ADR-0051 D5 + ADR-0019 D16: layout requireAdmin 1중 가드 상속. 재호출 0건.
 *   - ADR-0019 D12: force-dynamic + robots noindex는 layout 상속. title만 override.
 *
 * 가드 2종 (notFound 단일 출구):
 *   1. params.bookId UUID 형식 불일치 → notFound (사전 차단, DB 호출 방지)
 *   2. getReviewBookDetail이 null (book_review 행 없음) → notFound
 *   book_text 0행은 notFound가 아니다 — "빈 책"으로 렌더해 적재 누락을 화면에 드러낸다
 *   (lib/admin/review/query.ts 박제).
 *
 * 패턴 정합: app/(reader)/book/[id]/page.tsx (UUID_RE 사전 차단 + notFound 단일 출구)
 * ADR: docs/adr/0051-admin-review-screen.md D1·D5
 */

export const metadata: Metadata = {
  title: '텍스트 검수 · 키키북스',
};

/** UUID v4 형식 — app/(reader)/book/[id]/page.tsx 정합. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface AdminReviewDetailPageProps {
  params: { bookId: string };
}

export default async function AdminReviewDetailPage({
  params,
}: AdminReviewDetailPageProps) {
  // ADR-0019 D16 — requireAdmin 재호출 0건(layout 보증).

  if (!UUID_RE.test(params.bookId)) {
    notFound();
  }

  const detail = await getReviewBookDetail(params.bookId);
  if (!detail) {
    notFound();
  }

  return <ReviewDetailView detail={detail} />;
}
