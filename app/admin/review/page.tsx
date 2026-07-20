import type { Metadata } from 'next';
import Link from 'next/link';

import {
  getReviewBookList,
  type ReviewStatus,
} from '@/lib/admin/review/query';

/**
 * /admin/review — 검수 대상 책 목록 (ADR-0051 구현 1).
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
 * 클라이언트 컴포넌트 미분리 (구현 1 한정):
 *   - 본 화면은 읽기 전용 목록이며 필터·검색·낙관적 UI가 0건이다. 상호작용은 next/link
 *     내비게이션뿐이라 Server Component에서 직접 렌더한다(/admin/books의
 *     AdminBooksBrowser 같은 'use client' 경계가 필요 없음 — 번들 0증가).
 *   - 구현 2에서 목록에 상태 필터가 붙으면 그 시점에 Browser 컴포넌트로 분리한다.
 *
 * 카피 단일 출처 미적용 (구현 1 한정):
 *   - ADR-0019 D23의 lib/admin/copy.ts는 AdminCopy 인터페이스 고정 7섹션이라 review
 *     섹션 추가 = copy.ts 수정이 선결이다. 본 구현 1은 신규 파일만 만드는 범위라
 *     한국어 라벨을 파일 내 상수로 둔다 → 구현 2에서 copy.ts 편입(백로그).
 *
 * ADR: docs/adr/0051-admin-review-screen.md D1·D3·D5
 * 패턴 정합: app/admin/books/page.tsx (layout 가드 1중 신뢰 + title override + 헤더 토큰)
 */

export const metadata: Metadata = {
  title: '텍스트 검수 · 키키북스',
};

/** status 신호등 — ADR-0051 D3 박제(draft🔴 / in_review🟡 / confirmed🟢 / tts_done🔵). */
const STATUS_SIGNAL: Record<ReviewStatus, { lamp: string; label: string }> = {
  draft: { lamp: '🔴', label: '초안' },
  in_review: { lamp: '🟡', label: '검수중' },
  confirmed: { lamp: '🟢', label: '확정' },
  tts_done: { lamp: '🔵', label: '음성완료' },
};

export default async function AdminReviewPage() {
  // ADR-0019 D16 — requireAdmin 재호출 0건(layout 보증). 진입 = admin·curator 통과 자격.
  const rows = await getReviewBookList();

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-text md:text-3xl">
          텍스트 검수
        </h1>
        <p className="text-sm text-text-variant">
          {rows.length}권 · 낭독 확정본을 검수합니다.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-outline bg-surface p-4 text-sm text-text-variant">
          검수 대상 책이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const signal = STATUS_SIGNAL[row.status];
            return (
              <li key={row.bookId}>
                <Link
                  href={`/admin/review/${row.bookId}`}
                  className="flex items-center gap-3 rounded-lg border border-outline bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <span aria-hidden="true" className="text-base">
                    {signal.lamp}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                    {row.title}
                  </span>
                  <span className="shrink-0 text-xs text-text-variant">
                    {signal.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
