import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LibraryBrowser } from '@/components/library/library-browser';
import { ONBOARDING_PATH, SIGN_IN_PATH } from '@/lib/auth/routes';
import { getActiveChild } from '@/lib/home/active-child';
import { getLibraryCopy } from '@/lib/library/copy';
import {
  getBooks,
  LibraryFiltersSchema,
  type LibraryFilters,
} from '@/lib/library/query';
import { createClient } from '@/lib/supabase/server';

/**
 * /library — Screen 05 책 라이브러리 정식 페이지 (phase-13 CP3-b-2).
 *
 * phase-12 placeholder 시점에는 LIBRARY_PATH('/library')만 박제됐고 본 페이지는 404였다.
 * 본 페이즈에서 정식 구현 — 자녀가 /celebrate '다른 책 보러 가기'(ADR-0018 D13) 또는 직접
 * 진입으로 도달해 레벨·카테고리·키워드로 다음 책을 탐색한다.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 책임 분리
 * ──────────────────────────────────────────────────────────────────────────────
 *   본 Server Component: 3-가드 + 초기 fetch + LibraryBrowser 조립.
 *   LibraryBrowser('use client', components/library/library-browser.tsx): 필터·검색·
 *     무한 스크롤·빈 상태 인터랙션 전부. server action(lib/library/actions.ts)으로
 *     후속 페이지 fetch.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 3-가드 (intent §4.5, home/page.tsx 패턴 정합)
 * ──────────────────────────────────────────────────────────────────────────────
 *   1. auth.getUser → 미인증 redirect(SIGN_IN_PATH) — 미들웨어 1차, 본 페이지 2차 안전망
 *   2. getActiveChild → 자녀 0명 redirect(ONBOARDING_PATH) — "분기는 도착 지점에서"
 *      (phase-08 onboarding-flow + ADR-0011 결정 1 계승)
 *   3. 필터 입력 검증 → /library는 searchParams.category를 초기 필터로 복원(아래 L91~).
 *      클라→URL 동기화는 category만 구현됨(library-browser.tsx history.replaceState shallow,
 *      커밋 예정) — level·keyword의 URL 동기화는 여전히 F-item(ADR-0018 D12 명시 0건).
 *      필터 입력 검증은 fetchLibraryPage
 *      server action(actions.ts) + query.ts LibraryFiltersSchema가 책임 — 본 페이지는
 *      신뢰된 서버 컨텍스트라 직접 getBooks 호출(검증 우회 아닌 신뢰 경계 내부).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 캐싱·SEO (ADR-0018 D12)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - export const dynamic = 'force-dynamic' — 자녀별 SSR(향후 미독 필터 도입 시 즉시 정합)
 *     + revalidatePath 미사용 정합
 *   - metadata.robots { index: false, follow: false } — closed environment 정합
 *     (ADR-0013 결정 4 + app/robots.ts '/book' disallow 정책 정합. /library는
 *      PROTECTED_PREFIXES에 phase-12 등록 완료)
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 초기 fetch 정책
 * ──────────────────────────────────────────────────────────────────────────────
 *   Promise.all 병렬 — getBooks와 getLibraryCopy는 의존성 0건(home/page.tsx 패턴 정합).
 *   첫 페이지는 빈 필터({}) + cursor null = 카탈로그 최신 24권(synced_at DESC, id ASC
 *   복합 keyset, ADR-0018 D7 구현 CP 채택).
 *   activeChildId는 LibraryBrowser에 미주입(Q3 β 외부 Claude 채택) — books §9.1 USING(true)로
 *   child 무관 SELECT 가능. 미독 필터 도입 시(F-item) child_id 전달 가능.
 *
 * 의도 문서: docs/intent/screen-05-celebrate.md §3·§4.4·§5.4
 * ADR: docs/adr/0018-completion-rewards-and-library.md D7·D12·D13
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '라이브러리 · 키키북스',
  robots: { index: false, follow: false },
};

interface LibraryPageProps {
  searchParams?: { category?: string };
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  // 가드 1: 미인증 redirect — 미들웨어 1차, 본 페이지 2차 안전망 (phase-07 정합)
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(SIGN_IN_PATH);
  }

  // 가드 2: 자녀 0명 → 온보딩 (home/page.tsx 정합 — "분기는 도착 지점에서")
  const activeChild = await getActiveChild(supabase, user.id);
  if (!activeChild) {
    redirect(ONBOARDING_PATH);
  }

  // searchParams.category 검증 — 홈 카테고리 카드(/library?category={slug}) 진입점.
  // LibraryFiltersSchema(server action과 동일 스키마) 재사용. 잘못된·없는 slug는
  // safeParse 실패 → 빈 필터로 폴백(너그러운 무시 = 전체 카탈로그, 기존 동작 유지).
  const parsedFilters = LibraryFiltersSchema.safeParse({
    category: searchParams?.category,
  });
  const initialFilters: LibraryFilters = parsedFilters.success
    ? parsedFilters.data
    : {};

  // 초기 페이지 SSR — 초기 필터·cursor null. 2개 fetch 병렬 (의존성 0건).
  const [initialPage, copy] = await Promise.all([
    getBooks(supabase, initialFilters, null),
    getLibraryCopy(),
  ]);

  return (
    <main className="min-h-screen bg-surface-2 py-6">
      <div className="mx-auto flex max-w-screen-sm flex-col gap-4 px-4 md:max-w-screen-md md:gap-5 md:px-6 lg:max-w-screen-lg">
        {/*
          로그아웃 form — phase-13b CP3-c hotfix 확장 (자진 신고 6번 해소).
          - 박제 정합: admin layout.tsx hotfix 58cf4a5 + /home page.tsx hotfix 토큰·form
            패턴 100% 정합 + docs/intent/auth-flow.md §4.6 + route.ts:9 form POST 박제.
          - 'use client' 0건 — native HTML form action + POST가 Server Component에서 동작.
          - 라벨 "로그아웃" hardcoded — copy.ts(LibraryCopy) 박제 확장 회피 (자진 신고 5번 정합).
          - 기존 header h1·subtitle 박제 영향 0건 — div 감싸기로 좌측 그룹화 + form 우측 정렬.
          - header className 변형: flex-col gap-1 → items-start justify-between gap-3
            (h1 left + form right, shrink-0으로 button 압축 회피).
        */}
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-bold text-text md:text-3xl">
              {copy.title}
            </h1>
            <p className="text-sm text-text-variant">{copy.subtitle}</p>
          </div>
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              className="inline-flex shrink-0 items-center rounded-md border border-outline bg-surface px-2 py-1 text-xs font-medium text-text-variant transition-colors hover:bg-surface-2 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              로그아웃
            </button>
          </form>
        </header>

        <LibraryBrowser
          initialPage={initialPage}
          initialFilters={initialFilters}
          copy={copy}
        />
      </div>
    </main>
  );
}
