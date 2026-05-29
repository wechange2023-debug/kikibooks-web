import type { Metadata } from 'next';
import Link from 'next/link';

import { getAdminCopy } from '@/lib/admin/copy';

/**
 * /admin — 관리 홈 + 통계 4종 통합 (phase-13b CP2-b CP2-admin-foundation).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용 (CP1-adr)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - ADR-0019 D13: stats 별도 /admin/stats 페이지 미생성 — 본 /admin 홈에 통계 4 카드
 *     통합. CP5-b가 본 페이지 수정으로 getAdminStats() 실측 통합. 본 CP2-b는 placeholder
 *     "—"로 카드 4종을 박제(라벨은 copy.stats.cards.*에서 단일 출처).
 *   - ADR-0019 D9: 통계 = 단순 COUNT 4종(사용자·자녀·완독 세션·활성 책). 시계열·차트
 *     0건. 외부 차트 라이브러리 의존 0건.
 *   - ADR-0019 D16: requireAdmin 재호출 0건 — layout(app/admin/layout.tsx)이 1중 호출로
 *     본 페이지 진입을 보증. 본 page.tsx는 getAdminCopy()만.
 *
 * 페이지 구성:
 *   1) header — h1 pageTitles.home.title.
 *   2) stats section (id="stats") — AdminNav '통계' 링크의 anchor target(D13). 4 카드
 *      그리드(모바일 2×2, 데스크탑 1×4). 값은 placeholder "—"(CP5-b에서 실측 교체).
 *   3) 진입 카드 2종 — /admin/books, /admin/users (홈 → 다른 admin 페이지 동선).
 *
 * 토큰 재사용 (Hard Rule 10):
 *   - 카드: rounded-md border border-outline bg-surface shadow-elev-1
 *     (home/page.tsx aside 카드 정합).
 *   - 호버: hover:bg-surface-2(진입 카드 Link).
 *   - 타이포: font-display text-2xl md:text-3xl(h1, library/page.tsx 정합).
 *   - 신규 토큰·raw HEX 0건.
 *
 * Cache·SEO:
 *   - dynamic·robots는 layout(D12)이 상속. 본 페이지는 title만 override.
 *
 * ADR: docs/adr/0019-admin-system.md D9·D13·D16
 * 의도 문서: docs/intent/admin-system.md §4.4·§5.3·§5.6
 */

export const metadata: Metadata = {
  title: '관리 홈 · 키키북스',
};

export default async function AdminHomePage() {
  // D16 — requireAdmin 재호출 0건. layout이 보증.
  const copy = await getAdminCopy();

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-text md:text-3xl">
          {copy.pageTitles.home.title}
        </h1>
      </header>

      {/* D13 — stats anchor target. CP5-b가 본 섹션 children을 getAdminStats() 실측으로 교체. */}
      <section id="stats" aria-labelledby="stats-heading" className="flex flex-col gap-3">
        <h2 id="stats-heading" className="font-display text-lg font-semibold text-text">
          {copy.nav.stats}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatsPlaceholderCard label={copy.stats.cards.profilesCount.label} />
          <StatsPlaceholderCard label={copy.stats.cards.childrenCount.label} />
          <StatsPlaceholderCard label={copy.stats.cards.completedSessionsCount.label} />
          <StatsPlaceholderCard label={copy.stats.cards.activeBooksCount.label} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Link
          href="/admin/books"
          className="flex flex-col gap-1 rounded-md border border-outline bg-surface px-5 py-4 shadow-elev-1 transition-colors hover:bg-surface-2"
        >
          <span className="font-display text-base font-semibold text-text">
            {copy.nav.books}
          </span>
          <span className="text-sm text-text-variant">
            {copy.pageTitles.books.title}
          </span>
        </Link>
        <Link
          href="/admin/users"
          className="flex flex-col gap-1 rounded-md border border-outline bg-surface px-5 py-4 shadow-elev-1 transition-colors hover:bg-surface-2"
        >
          <span className="font-display text-base font-semibold text-text">
            {copy.nav.users}
          </span>
          <span className="text-sm text-text-variant">
            {copy.pageTitles.users.title}
          </span>
        </Link>
      </section>
    </div>
  );
}

interface StatsPlaceholderCardProps {
  label: string;
}

/**
 * 통계 카드 placeholder — 값 "—"는 CP5-b에서 실측 COUNT로 교체(D13).
 * 본 CP2-b는 카드 골격·라벨·반응형 그리드만 박제.
 */
function StatsPlaceholderCard({ label }: StatsPlaceholderCardProps) {
  return (
    <div className="rounded-md border border-outline bg-surface px-4 py-3 shadow-elev-1">
      <div className="text-xs text-text-variant">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold text-text">—</div>
    </div>
  );
}
