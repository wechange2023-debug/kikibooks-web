import { Baby, BookCheck, BookOpen, Users } from 'lucide-react';

import type { AdminCopy } from '@/lib/admin/copy';
import type { AdminStats } from '@/lib/admin/stats/query';

/**
 * /admin 홈 통계 4종 카드 그리드 (phase-13b CP5-b 신규).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용 (CP1-adr ADR-0019)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - D9: 통계 = 단순 COUNT 4종(사용자·자녀·완독 세션·활성 책). 시계열·차트·필터 0건.
 *     외부 차트 라이브러리(recharts·chart.js 등) 의존 0건.
 *   - D13: /admin 홈 통합 — 별도 /admin/stats 페이지 미생성. app/admin/page.tsx가 본
 *     컴포넌트를 통합 렌더. spec line 101 직역: "Server Component(인터랙션 0건) 또는 단순
 *     dumb component, 4종 카드 그리드(아이콘·라벨·숫자·서브텍스트). design-system Card
 *     토큰 재사용".
 *   - intent §4.4·§5.6: getAdminStats() SSR → 카드 그리드(모바일 2×2, 데스크탑 1×4).
 *     숫자 천 단위 콤마. 자동 polling·realtime subscription 0건.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 컴포넌트 책임 박제
 * ──────────────────────────────────────────────────────────────────────────────
 *   - dumb component — 인터랙션 0건. 'use client' 0건(Server Component으로 렌더).
 *   - service role 사용 0건 → import 'server-only' 0건. COUNT는 호출자(page)가
 *     getAdminStats()로 fetch해 props 주입(books·users browser props 패턴 정합).
 *   - 가드 0건 — layout requireAdmin(D16)이 도달 보증. 본 컴포넌트는 표시만.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * props 패턴 박제 (books·users browser 정합)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - stats: AdminStats — page에서 await한 4종 COUNT 결과.
 *   - copy: AdminCopy['stats'] — 카드 label·sublabel 단일 출처(외부 검토 C: 전체 stats
 *     섹션 주입, books browser copy={copy.books}·users copy={copy.users} 정합).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 자진 신고 박제
 * ──────────────────────────────────────────────────────────────────────────────
 *   - #11 아이콘 매핑 하드코딩 — spec line 101 "아이콘" 박제하나 어떤 lucide 아이콘인지
 *     박제 0건. Users/Baby/BookCheck/BookOpen 매핑을 본 컴포넌트 내부에 직접 둔다(AdminCopy
 *     확장 0건 — copy는 텍스트 단일 출처, 아이콘은 컴포넌트 책임). phase-13c follow-up
 *     후보(아이콘 키 박제 또는 design-system 아이콘 매핑 추출).
 *   - #12 locale 'ko-KR' 하드코딩 — toLocaleString('ko-KR') 천 단위 콤마. i18n 진입 시 정정.
 *
 * 토큰 재사용 (Hard Rule 10 — CP2-b placeholder 카드 정합, 신규 토큰·raw HEX 0건):
 *   - 그리드: grid grid-cols-2 gap-3 md:grid-cols-4.
 *   - 카드: rounded-md border border-outline bg-surface px-4 py-3 shadow-elev-1.
 *   - 라벨·서브·아이콘: text-text-variant (placeholder label 토큰 정합).
 *   - 값: font-display text-2xl font-bold text-text (placeholder value 토큰 정합).
 *   shadcn/ui Card 미사용 — placeholder가 raw div 토큰이라 정합 유지(신규 의존 0건).
 *
 * ADR: docs/adr/0019-admin-system.md D9·D13
 * 의도 문서: docs/intent/admin-system.md §4.4·§5.6
 * 패턴 정합: app/admin/page.tsx CP2-b StatsPlaceholderCard(본 CP5-b가 실측으로 대체)
 */

interface StatsDashboardProps {
  stats: AdminStats;
  copy: AdminCopy['stats'];
}

interface StatsCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  sublabel?: string;
}

/** 통계 카드 1건 — 아이콘·라벨·숫자·서브텍스트(spec line 101 직역). */
function StatsCard({ icon, label, value, sublabel }: StatsCardProps) {
  return (
    <div className="rounded-md border border-outline bg-surface px-4 py-3 shadow-elev-1">
      <div className="flex items-center gap-1.5 text-text-variant">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      {/* #12 locale 'ko-KR' 하드코딩 — 천 단위 콤마, i18n 진입 시 정정. */}
      <div className="mt-1 font-display text-2xl font-bold text-text">
        {value.toLocaleString('ko-KR')}
      </div>
      {sublabel ? (
        <div className="mt-0.5 text-xs text-text-variant">{sublabel}</div>
      ) : null}
    </div>
  );
}

/**
 * 통계 4종 카드 그리드. 카드는 4× 명시(D9 4종 고정 — CARD_KEYS 순회 미사용).
 *
 * #11 아이콘 매핑 하드코딩 — Users/Baby/BookCheck/BookOpen은 본 컴포넌트 책임.
 */
export function StatsDashboard({ stats, copy }: StatsDashboardProps) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatsCard
        icon={<Users className="size-4" aria-hidden="true" />}
        label={copy.cards.profilesCount.label}
        value={stats.profilesCount}
        sublabel={copy.cards.profilesCount.sublabel}
      />
      <StatsCard
        icon={<Baby className="size-4" aria-hidden="true" />}
        label={copy.cards.childrenCount.label}
        value={stats.childrenCount}
        sublabel={copy.cards.childrenCount.sublabel}
      />
      <StatsCard
        icon={<BookCheck className="size-4" aria-hidden="true" />}
        label={copy.cards.completedSessionsCount.label}
        value={stats.completedSessionsCount}
        sublabel={copy.cards.completedSessionsCount.sublabel}
      />
      <StatsCard
        icon={<BookOpen className="size-4" aria-hidden="true" />}
        label={copy.cards.activeBooksCount.label}
        value={stats.activeBooksCount}
        sublabel={copy.cards.activeBooksCount.sublabel}
      />
    </div>
  );
}
