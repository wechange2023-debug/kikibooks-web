'use client';

import Link from 'next/link';
import { useState } from 'react';

import { isPilotCohort, PILOT_COHORT } from '@/lib/admin/review/pilot-cohort';
import type { ReviewBookListRow, ReviewStatus } from '@/lib/admin/review/query';
import { hasRotatedPages } from '@/lib/admin/review/rotation-pages';

/**
 * ReviewListView — /admin/review 목록 + 시범 코호트 필터 (ADR-0051 구현 3-b).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 클라이언트 분리 사유 (구현 1 보고에서 예고한 그 분리)
 * ──────────────────────────────────────────────────────────────────────────────
 *   구현 1에서는 목록에 상호작용이 0건이라 Server Component가 직접 렌더했다. 구현 3-b가
 *   토글을 도입하면서 클라이언트 상태가 필요해져 렌더 부분만 'use client'로 분리한다
 *   (app/admin/books/page.tsx → AdminBooksBrowser 패턴 정합).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 필터·정렬 (화면단 처리 — 조회 시그니처 불변)
 * ──────────────────────────────────────────────────────────────────────────────
 *   getReviewBookList()는 152권 전건을 status 순으로 반환한다(변경 0건). 본 컴포넌트가
 *   받은 데이터를 걸러 보여준다:
 *     - 시범 12권 보기(기본 ON): PILOT_COHORT에 든 책만, **slug 알파벳순 고정**.
 *       상태가 바뀌어도 행 순서가 흔들리지 않아야 검수 중 위치 감각이 유지된다.
 *     - 전체 보기: 받은 순서 그대로(= status 순, 152권). 재정렬 0건.
 *
 * ADR-0051 D4: 회전 의심 면을 가진 책에 ⚠ 아이콘(표시 전용, 교정 0건).
 *
 * 토큰 재사용 (Hard Rule 10):
 *   font-display·text-text·text-text-variant·bg-surface·bg-surface-2·border-outline·
 *   primary 계열만 사용. 신규 토큰·raw HEX 0건.
 *
 * ADR: docs/adr/0051-admin-review-screen.md D1·D3·D4
 */

/** status 신호등 — ADR-0051 D3 박제. review-detail-view.tsx와 동일 매핑. */
const STATUS_SIGNAL: Record<ReviewStatus, { lamp: string; label: string }> = {
  draft: { lamp: '🔴', label: '초안' },
  in_review: { lamp: '🟡', label: '검수중' },
  confirmed: { lamp: '🟢', label: '확정' },
  tts_done: { lamp: '🔵', label: '음성완료' },
};

/**
 * "확정 완료"로 세는 상태.
 *
 * confirmed와 tts_done 둘 다 센다 — tts_done은 confirmed를 이미 지나 음성까지 만들어진
 * 상태라 진행도에서 되돌아가면 안 된다(ADR-0051 D3 파이프라인 순서).
 */
function isDone(status: ReviewStatus): boolean {
  return status === 'confirmed' || status === 'tts_done';
}

export function ReviewListView({ rows }: { rows: ReviewBookListRow[] }) {
  const [pilotOnly, setPilotOnly] = useState(true);

  const pilotRows = rows
    .filter((row) => isPilotCohort(row.slug))
    // slug 알파벳순 고정 — status가 바뀌어도 순서 불변.
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const visibleRows = pilotOnly ? pilotRows : rows;
  const doneCount = pilotRows.filter((row) => isDone(row.status)).length;

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold text-text md:text-3xl">
          텍스트 검수
        </h1>

        <div className="flex flex-wrap items-center gap-2 text-sm text-text-variant">
          <button
            type="button"
            onClick={() => setPilotOnly((prev) => !prev)}
            className="inline-flex items-center rounded-md border border-outline bg-surface px-3 py-1 text-xs font-medium text-text transition-colors hover:bg-surface-2 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {pilotOnly ? '전체 보기' : '시범 12권만 보기'}
          </button>
          <span>
            {pilotOnly
              ? `시범 ${PILOT_COHORT.length}권`
              : `전체 ${rows.length}권`}
          </span>
        </div>

        {/* 시범 코호트 진행 표시 — 전체 보기에서도 진행도는 코호트 기준으로 유지한다. */}
        <p className="text-sm text-text-variant">
          {doneCount} / {PILOT_COHORT.length}권 확정 완료
        </p>
      </header>

      {visibleRows.length === 0 ? (
        <p className="rounded-lg border border-outline bg-surface p-4 text-sm text-text-variant">
          {pilotOnly
            ? '시범 코호트에 해당하는 책이 목록에 없습니다.'
            : '검수 대상 책이 없습니다.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibleRows.map((row) => {
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
                  {/* ADR-0051 D4 — 회전 의심 면을 가진 책 식별용. 표시 전용(교정 0건). */}
                  {hasRotatedPages(row.slug) && (
                    <span
                      title="회전 의심 면이 있는 책입니다."
                      className="shrink-0 text-xs text-text-variant"
                    >
                      ⚠
                    </span>
                  )}
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
