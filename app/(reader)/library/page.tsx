import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LibraryBrowser } from '@/components/library/library-browser';
import { SIGN_IN_PATH } from '@/lib/auth/routes';
import { getLibraryCopy } from '@/lib/library/copy';
import {
  getBooks,
  LibraryFiltersSchema,
  type LibraryFilters,
} from '@/lib/library/query';
import { createClient } from '@/lib/supabase/server';
import { BRAND_NAME } from '@/lib/brand';

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
 * 2-가드 (intent §4.5, home/page.tsx 패턴 정합)
 * ──────────────────────────────────────────────────────────────────────────────
 *   1. auth.getUser → 미인증 redirect(SIGN_IN_PATH) — 미들웨어 1차, 본 페이지 2차 안전망
 *      — **자녀 0명 가드는 ADR-0064 D6으로 삭제됐다**(2026-08-20). 자녀 없이도
 *        목록을 볼 수 있어야 하며, activeChild는 이 페이지에서 가드 외 용도가 없었다
 *        (아래 activeChildId 미주입 주석 참조). 조회는 getBooks(supabase, filters, null).
 *   2. 필터 입력 검증 → /library는 searchParams.category를 초기 필터로 복원(아래 L91~).
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
  title: `라이브러리 · ${BRAND_NAME}`,
  robots: { index: false, follow: false },
};

interface LibraryPageProps {
  searchParams?: { category?: string };
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const supabase = createClient();

  // searchParams.category 검증 — 홈 카테고리 카드(/library?category={slug}) 진입점.
  // LibraryFiltersSchema(server action과 동일 스키마) 재사용. 잘못된·없는 slug는
  // safeParse 실패 → 빈 필터로 폴백(너그러운 무시 = 전체 카탈로그, 기존 동작 유지).
  // ★ 세션 조회보다 **앞**에 둔다 — 동기 파싱이라 왕복이 0이고, 아래 병렬 착수에 필요하다.
  const parsedFilters = LibraryFiltersSchema.safeParse({
    category: searchParams?.category,
  });
  const initialFilters: LibraryFilters = parsedFilters.success
    ? parsedFilters.data
    : {};

  // ★ ADR-0067 D4 — 세션 조회와 초기 페이지 조회를 함께 착수한다.
  //   getBooks는 user를 **인자로도 받지 않는다**(lib/library/query.ts:219-223) — 순차였던
  //   이유가 값 의존이 아니라 코드 배치였다. 왕복 2 → 1.
  //   대가: 비로그인 요청에도 getBooks가 1건 나간다. books는 전체 공개라
  //   (001_initial_schema.sql:214) 노출은 늘지 않고, /library는 PROTECTED_PREFIXES라
  //   미들웨어가 이미 /login으로 보내므로 여기 도달하는 비로그인 요청 자체가 드물다.
  const [
    {
      data: { user },
    },
    initialPage,
    copy,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getBooks(supabase, initialFilters, null),
    getLibraryCopy(),
  ]);

  // 가드 1: 미인증 redirect — 미들웨어 1차, 본 페이지 2차 안전망 (phase-07 정합).
  //   결과 수령 **후** 평가한다(D4). 리다이렉트되는 요청의 initialPage는 그대로 버려진다.
  if (!user) {
    redirect(SIGN_IN_PATH);
  }

  return (
    <main className="min-h-screen bg-surface-2 py-6">
      <div className="mx-auto flex max-w-screen-sm flex-col gap-4 px-4 md:max-w-screen-md md:gap-5 md:px-6 lg:max-w-screen-lg">
        {/*
          h1+subtitle은 본문 콘텐츠라 page 잔류(ADR-0021 D4). 로그아웃·네비는 공통
          헤더(components/app/app-header.tsx)로 수렴 → 우측 form 제거, flex-col 복원.
        */}
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h1 font-bold text-text">
            {copy.title}
          </h1>
          <p className="text-label text-text-variant">{copy.subtitle}</p>
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
