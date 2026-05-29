import type { Metadata } from 'next';

import { AdminNav } from '@/components/admin/admin-nav';
import { getAdminCopy } from '@/lib/admin/copy';
import { requireAdmin } from '@/lib/admin/gate';

/**
 * /admin/* 레이아웃 — phase-13b CP2-b CP2-admin-foundation.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용 (CP1-adr)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - ADR-0019 D12: /admin/* 전체 force-dynamic + robots noindex. admin 데이터 매번
 *     fresh(role 변경 즉시 반영·통계 실시간). ISR 미적용. closed environment 정합
 *     (ADR-0013 결정 4 + app/robots.ts '/admin' disallow 정책 정합 — D15는 본 CP2-b에서
 *     동시 박제).
 *   - ADR-0019 D14: middleware.ts PROTECTED_PREFIXES에 '/admin' 추가(본 CP2-b에서
 *     lib/auth/routes.ts 1줄). 미들웨어 1차 가드(미인증 redirect) + 본 layout
 *     requireAdmin 2차 가드(role 검증).
 *   - ADR-0019 D16: 페이지 가드 1중 — layout이 requireAdmin을 호출하면 모든 /admin/*
 *     페이지 컴포넌트는 자체 requireAdmin 재호출 0건. Next.js layout 동작이 보증
 *     (페이지 컴포넌트 도달 전 layout 실행). server action·server function 호출은
 *     layout 외부 표면이라 자체 가드 필수(D2 트리플 가드).
 *   - ADR-0019 D2: 본 layout이 호출하는 requireAdmin은 가드 ③단(role IN admin·curator).
 *     ①zod·②auth·④service role UPDATE는 mutation server action 책임(CP3-a 예정).
 *   - ADR-0019 D8: admin·curator 동일 권한 — requireAdmin 통과 시 ctx.profile.role은
 *     'admin' | 'curator'. layout은 role badge 표시 외 분기 0건.
 *
 * Cache·SEO 정책 (D12):
 *   - export const dynamic = 'force-dynamic' — 모든 /admin/* 페이지가 본 정책 상속.
 *   - metadata.robots { index: false, follow: false } — 페이지 metadata가 미설정 시
 *     본 layout 정책 상속(자식 페이지는 title만 override 가능, robots는 상속).
 *
 * 가드·렌더 흐름:
 *   1) requireAdmin() — 미인증·비admin은 redirect로 호출자 흐름 중단. AdminContext 반환.
 *   2) getAdminCopy() — 카피 단일 출처. role badge 라벨 매핑에 사용.
 *   3) AdminNav (Client) — 4링크 + 활성 표시.
 *   4) {children} — page.tsx 렌더.
 *
 * 토큰 재사용 (Hard Rule 10):
 *   - 페이지 배경 bg-surface-2 py-6 (home/page.tsx·library/page.tsx 정합).
 *   - 컨테이너 mx-auto max-w-screen-sm md:max-w-screen-md lg:max-w-screen-lg
 *     + px-4 md:px-6 (home·library 정합).
 *   - role badge bg-surface border-outline text-text-variant (home/page.tsx aside 정합).
 *   - 신규 토큰·raw HEX 0건.
 *
 * ADR: docs/adr/0019-admin-system.md D2·D8·D12·D14·D16
 * 의도 문서: docs/intent/admin-system.md §4.1·§4.5·§5.2
 * 패턴 정합: app/library/page.tsx (force-dynamic·robots·컨테이너·헤더)
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '관리 · 키키북스',
  robots: { index: false, follow: false },
};

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  // D16 — layout 가드 1중 호출. 자식 페이지는 재호출 0건.
  // D2 ③단 — role IN ('admin','curator') 통과 후만 children 렌더.
  // 미통과 시 requireAdmin 내부 redirect로 흐름 중단(본 함수는 도달 0건).
  const ctx = await requireAdmin();
  const copy = await getAdminCopy();

  return (
    <main className="min-h-screen bg-surface-2 py-6">
      <div className="mx-auto flex max-w-screen-sm flex-col gap-4 px-4 md:max-w-screen-md md:gap-5 md:px-6 lg:max-w-screen-lg">
        <header className="flex items-center justify-end">
          <span className="rounded-md border border-outline bg-surface px-2 py-1 text-xs font-medium text-text-variant">
            {copy.users.roleBadges[ctx.profile.role]}
          </span>
        </header>

        <AdminNav copy={copy.nav} />

        {children}
      </div>
    </main>
  );
}
