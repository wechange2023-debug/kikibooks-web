import type { Metadata } from 'next';

import { AppFooter } from '@/components/app/app-footer';
import { AppHeader } from '@/components/app/app-header';
import { LandingHeader } from '@/components/landing/landing-header';
import { AnonymousMain } from '@/components/main/anonymous-main';
import { MemberMain } from '@/components/main/member-main';
import { NoChildMain } from '@/components/main/no-child-main';
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { getChildOptionalCopy } from '@/lib/child-optional/copy';
import { getActiveChild } from '@/lib/home/active-child';
import { CATEGORIES, getCategoryDistribution } from '@/lib/home/categories';
import { getHomeCopy } from '@/lib/home/copy';
import { buildGreeting, getGreetingProfile } from '@/lib/home/greeting';
import { getRecommendations } from '@/lib/home/recommendations';
import { getStreakThisWeek } from '@/lib/home/streak';
import { getLandingCopy } from '@/lib/landing/copy';
import { getPopularBooks, type PopularBook } from '@/lib/landing/popular-books';
import { createClient } from '@/lib/supabase/server';

const PAGE_TITLE = `${BRAND_NAME} · ${BRAND_TAGLINE}`;
const PAGE_DESCRIPTION =
  '만 3~7세 아이를 위한 무료 영어 그림책 서재. 890권이 넘는 그림책을 나이별 맞춤 추천으로, 광고 없이 안전하게 보여주세요.';

/**
 * SEO 메타데이터는 **정적**이다 — 로그인 상태로 개인화하지 않는다.
 *
 * ADR-0062 회귀 목록 17번: 크롤러는 비로그인이므로 `/`에서 마케팅 랜딩만 본다.
 * metadata가 상태 의존이 되면 OG 카드에 개인 정보가 샐 수 있으므로 static을 유지한다.
 * og:image·twitter:image는 app/opengraph-image.tsx를 Next가 자동 연결한다.
 */
export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    siteName: BRAND_NAME,
    locale: 'ko_KR',
    type: 'website',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

/**
 * `/` — **단일 메인 페이지** (ADR-0062 D1).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 3갈래 분기 (D1·D4)
 * ──────────────────────────────────────────────────────────────────────────────
 *   1. 비로그인          → 랜딩 블록(AnonymousMain) 렌더. **리다이렉트 0회**
 *   2. 로그인 + 자녀 0명 → 자녀 미등록 블록(NoChildMain) 렌더. **리다이렉트 0회**
 *      (ADR-0064 D1 — 종전 `redirect(/onboarding)`을 뒤집었다. 자녀 없는 성인도 열람한다)
 *   3. 로그인 + 자녀≥1   → 개인화 블록(MemberMain) 렌더. **리다이렉트 0회**
 *
 * ADR-0062 **Amendment 1** — 로그인 메인에도 랜딩 섹션(인기 책·핵심가치)이 붙는다.
 *   섹션 순서: 히어로 → 레벨 → 추천 → 카테고리 → 인기 책 → 핵심가치 → 푸터.
 *
 * v1은 로그인 사용자를 `/home`으로 리다이렉트했다(ADR-0012 결정 4). ADR-0062 D8이
 * 그 결정을 supersede해 **리다이렉트 대신 블록을 바꿔 렌더**한다 — 로그인 사용자의
 * `/` 접근에서 왕복 1회가 사라진다.
 *
 * ★ 유지되는 원칙: **미들웨어는 이 분기를 하지 않는다.** `/`는 `PROTECTED_PREFIXES`에
 *   넣지 않는 공개 라우트이며(ADR-0009 3.4절 모델), 분기는 도착 지점 1회다
 *   (ADR-0011 결정 1). 데이터 보호의 최종 방어선은 RLS다.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 헤더·푸터 (D5)
 * ──────────────────────────────────────────────────────────────────────────────
 *   헤더는 상태로 고른다 — 비로그인 `LandingHeader`(로그인/회원가입) /
 *   로그인 `AppHeader`(4개 내비 + 로그아웃). 내비 항목이 완전히 달라 합치지 않는다.
 *   푸터는 양쪽 다 `AppFooter`로 일원화한다(O-M3 확정).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 렌더링·비용
 * ──────────────────────────────────────────────────────────────────────────────
 *   `createClient()`가 쿠키를 읽으므로 이 라우트는 **원래부터 dynamic**이다
 *   (ADR-0012 결정 6 승계) — 통합으로 인한 static→dynamic 전환은 없다.
 *   미들웨어도 이미 `/`를 matcher에 포함하므로 세션 판독 비용 증가분도 0이다.
 *   인기 책 랜덤 6권은 매 요청 새로 뽑힌다(ADR-0012 결정 3).
 *   `getCategoryDistribution`은 unstable_cache(tags: books-catalog)라 비로그인
 *   경로에서도 왕복이 사실상 0이다.
 *
 * 의도 문서: docs/intent/screen-01-landing.md · docs/intent/screen-02-home.md
 */

export const dynamic = 'force-dynamic';

export default async function MainPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── 갈래 1: 비로그인 → 랜딩 ────────────────────────────────────────────────
  if (!user) {
    const [copy, homeCopy, distribution] = await Promise.all([
      getLandingCopy(),
      getHomeCopy(),
      getCategoryDistribution(supabase),
    ]);

    // 인기 책 조회 실패가 마케팅 페이지 전체를 막지 않도록 방어한다(ADR-0012).
    let books: PopularBook[] = [];
    try {
      books = await getPopularBooks(supabase);
    } catch (error) {
      console.error('MainPage: 인기 책 조회 실패 —', error);
    }

    return (
      <div className="flex min-h-screen flex-col bg-bg">
        <LandingHeader brandName={copy.brandName} copy={copy.header} />
        <main className="flex-1">
          <AnonymousMain
            copy={copy}
            homeCopy={homeCopy}
            books={books}
            categories={CATEGORIES}
            distribution={distribution}
          />
        </main>
        <AppFooter />
      </div>
    );
  }

  // ── 갈래 2·3: 로그인 ──────────────────────────────────────────────────────
  // activeChild-무관 fetch를 자녀 가드와 겹쳐 착수한다(왕복 1회 절감, P0-3(A) 승계).
  const profilePromise = getGreetingProfile(supabase, user.id);
  const copyPromise = getHomeCopy();
  const distributionPromise = getCategoryDistribution(supabase);
  // ADR-0062 Amd.1 — 로그인 메인에도 인기 책·핵심가치 섹션이 들어간다.
  // getLandingCopy()는 정적 상수라 왕복이 아니고, getPopularBooks()가 유일한 신규 쿼리다.
  const landingCopyPromise = getLandingCopy();
  const popularBooksPromise = getPopularBooks(supabase).catch((error) => {
    console.error('MainPage: 인기 책 조회 실패(로그인) —', error);
    return [] as PopularBook[];
  });

  // 갈래 2 — 자녀 0명. **ADR-0064 D1이 종전 redirect(ONBOARDING_PATH)를 뒤집는다.**
  //   공부방·학원 선생님처럼 자녀가 없는 성인도 열람은 할 수 있어야 하므로,
  //   되돌리지 않고 전용 블록을 렌더한다. 기록계 기능(레벨·추천·스트릭)은
  //   전부 빠진다 — ADR-0064 §원칙 절 "기록계 기능은 자녀 0명에게 일괄 숨김".
  const activeChild = await getActiveChild(supabase, user.id);
  if (!activeChild) {
    // 인사말은 자녀 이름을 요구하므로(greeting.ts:66-75) 이 갈래에서 쓰지 않는다.
    // 이미 착수된 promise라 rejection만 흡수한다 — 미사용 promise가 unhandled로
    // 남지 않게 하기 위함이며(getGreetingProfile은 조회 실패 시 throw한다),
    // 갈래 3의 병렬 fetch 이득은 그대로 둔다.
    void profilePromise.catch(() => undefined);

    const [homeCopy, distribution, landingCopy, popularBooks, childOptionalCopy] =
      await Promise.all([
        copyPromise,
        distributionPromise,
        landingCopyPromise,
        popularBooksPromise,
        getChildOptionalCopy(),
      ]);

    return (
      <>
        <AppHeader />
        <main className="min-h-screen bg-surface-2 pb-8">
          <NoChildMain
            copy={childOptionalCopy}
            landingCopy={landingCopy}
            homeCopy={homeCopy}
            books={popularBooks}
            categories={CATEGORIES}
            distribution={distribution}
          />
        </main>
        <AppFooter />
      </>
    );
  }

  const [
    profile,
    recommendation,
    streakDays,
    copy,
    distribution,
    landingCopy,
    popularBooks,
  ] = await Promise.all([
    profilePromise,
    getRecommendations(supabase, activeChild),
    getStreakThisWeek(supabase, activeChild.id),
    copyPromise,
    distributionPromise,
    landingCopyPromise,
    popularBooksPromise,
  ]);

  const greeting = buildGreeting(profile, activeChild, copy.greeting);

  // 갈래 3 — 개인화 메인.
  return (
    <>
      <AppHeader />
      <main className="min-h-screen bg-surface-2 pb-8">
        <MemberMain
          greeting={greeting}
          child={activeChild}
          recommendation={recommendation}
          streakDays={streakDays}
          copy={copy}
          categories={CATEGORIES}
          distribution={distribution}
          popularBooks={popularBooks}
          landingCopy={landingCopy}
        />
      </main>
      <AppFooter />
    </>
  );
}
