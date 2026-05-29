import type { Metadata } from 'next';

import { AdminBooksBrowser } from '@/components/admin/books/admin-books-browser';
import { getAdminBooks } from '@/lib/admin/books/query';
import { getAdminCopy } from '@/lib/admin/copy';

/**
 * /admin/books — 콘텐츠 큐레이션 페이지 (phase-13b CP3-b).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용 (CP1-adr ADR-0019)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - D5: getAdminBooks는 createServiceRoleClient + 호출자 가드 통과 후만 호출.
 *     본 페이지의 호출 자격 = layout(app/admin/layout.tsx)의 requireAdmin 1중 가드(D16).
 *   - D16: 페이지 가드 1중 — layout이 requireAdmin을 호출하면 본 페이지는 자체 재호출
 *     0건. Next.js layout 동작이 도달 보증.
 *   - D12: force-dynamic + robots noindex는 layout 상속. 본 페이지는 title만 override.
 *
 * 초기 데이터 로드:
 *   - Promise.all로 getAdminBooks({}, null) + getAdminCopy() 병렬. 의존성 0건.
 *   - 빈 필터({}) → 첫 24권(synced_at DESC + id ASC keyset, is_active 디폴트 any —
 *     비공개 책 포함, intent §4.2 박제).
 *   - searchParams 0건 — D20 박제 정합(URL 동기화 미적용, 클라이언트 useState만).
 *
 * 책임 분리:
 *   - 본 Server Component: 가드 신뢰 + 초기 fetch + 헤더 + AdminBooksBrowser 조립.
 *   - AdminBooksBrowser ('use client'): 필터·검색·낙관적 UI·무한스크롤 인터랙션 전부.
 *
 * 토큰 재사용 (Hard Rule 10):
 *   - 헤더: font-display text-2xl md:text-3xl text-text (library/page.tsx + admin/page.tsx 정합).
 *   - 컨테이너: layout이 max-w-* + bg-surface-2 처리. 본 페이지는 children gap만.
 *   - 신규 토큰·raw HEX 0건.
 *
 * ADR: docs/adr/0019-admin-system.md D5·D12·D16·D20
 * 의도 문서: docs/intent/admin-system.md §4.2·§5.3
 * 패턴 정합: app/library/page.tsx(getBooks 직접 호출 + Browser 조립), app/admin/page.tsx
 *           (layout 가드 1중 신뢰 + getAdminCopy 호출).
 */

export const metadata: Metadata = {
  title: '콘텐츠 큐레이션 · 키키북스',
};

export default async function AdminBooksPage() {
  // D16 — requireAdmin 재호출 0건(layout 보증). 본 페이지 진입은 admin·curator 통과 자격.

  const [initialPage, copy] = await Promise.all([
    getAdminBooks({}, null),
    getAdminCopy(),
  ]);

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-text md:text-3xl">
          {copy.pageTitles.books.title}
        </h1>
      </header>

      <AdminBooksBrowser initialPage={initialPage} copy={copy.books} />
    </div>
  );
}
