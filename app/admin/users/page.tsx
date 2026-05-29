import type { Metadata } from 'next';

import { AdminUsersBrowser } from '@/components/admin/users/admin-users-browser';
import { getAdminCopy } from '@/lib/admin/copy';
import {
  getAdminChildren,
  getAdminProfiles,
} from '@/lib/admin/users/query';

/**
 * /admin/users — 사용자·자녀 조회 페이지 (phase-13b CP4-b).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용 (CP1-adr ADR-0019)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - D5: getAdminProfiles·getAdminChildren = createServiceRoleClient + 호출자 가드
 *     통과 후만. 본 페이지 호출 자격 = layout(app/admin/layout.tsx)의 requireAdmin
 *     1중 가드(D16).
 *   - D7: 자녀 read-only — 본 페이지는 조회만, mutation 0건.
 *   - D12: force-dynamic + robots noindex는 layout 상속. 본 페이지는 title만 override.
 *   - D16: 페이지 가드 1중 — layout이 requireAdmin 호출하면 본 페이지 자체 재호출 0건.
 *   - D20: tabs URL 동기화 0건 — 본 page.tsx는 searchParams 0건, 모든 tab state는
 *     클라이언트(AdminUsersBrowser useState).
 *   - D21: parent_email 노출 + 마스킹 0건 — query.ts JOIN 평탄화, UI 직접 표시.
 *
 * 초기 데이터 로드 (외부 검토 10번 — 양 tab 동시 SSR):
 *   - Promise.all 3건 병렬: getAdminProfiles({}, null) + getAdminChildren({}, null) +
 *     getAdminCopy(). 의존성 0건.
 *   - 양 tab(profiles + children) 초기 SSR — tab 전환 시 즉시 표시 가능(검색 상태 분리).
 *
 * 책임 분리:
 *   - 본 Server Component: 가드 신뢰 + 초기 fetch + 헤더 + AdminUsersBrowser 조립.
 *   - AdminUsersBrowser ('use client'): tabs·검색·페이지네이션·empty·에러 인터랙션.
 *
 * 토큰 재사용 (Hard Rule 10):
 *   - 헤더: font-display text-2xl md:text-3xl text-text (library·admin/books 정합).
 *   - 컨테이너: layout이 max-w-* + bg-surface-2 처리. 본 페이지는 gap만.
 *   - 신규 토큰·raw HEX 0건.
 *
 * ADR: docs/adr/0019-admin-system.md D5·D7·D12·D16·D20·D21
 * 의도 문서: docs/intent/admin-system.md §4.3·§5.5
 * 패턴 정합: app/admin/books/page.tsx(CP3-b 63줄) Server Component + Promise.all + Browser 조립
 */

export const metadata: Metadata = {
  title: '사용자 관리 · 키키북스',
};

export default async function AdminUsersPage() {
  // D16 — requireAdmin 재호출 0건(layout 보증). 본 페이지 진입 = admin·curator 통과 자격.

  const [initialProfiles, initialChildren, copy] = await Promise.all([
    getAdminProfiles({}, null),
    getAdminChildren({}, null),
    getAdminCopy(),
  ]);

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-text md:text-3xl">
          {copy.pageTitles.users.title}
        </h1>
      </header>

      <AdminUsersBrowser
        initialProfiles={initialProfiles}
        initialChildren={initialChildren}
        copy={copy.users}
      />
    </div>
  );
}
