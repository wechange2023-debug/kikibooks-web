import { redirect } from 'next/navigation';

import { HeroSection } from '@/components/landing/hero-section';
import { LandingFooter } from '@/components/landing/landing-footer';
import { LandingHeader } from '@/components/landing/landing-header';
import { PopularBooks } from '@/components/landing/popular-books';
import { ValueProps } from '@/components/landing/value-props';
import { resolvePostLoginPath } from '@/lib/auth/resolve-post-login-path';
import { getLandingCopy } from '@/lib/landing/copy';
import { getPopularBooks, type PopularBook } from '@/lib/landing/popular-books';
import { createClient } from '@/lib/supabase/server';

/**
 * Screen 01 랜딩 페이지 (`/`).
 *
 * 비로그인 방문자에게 5개 섹션(헤더·히어로·핵심 가치·인기 책·푸터)을 보여주는
 * 마케팅 페이지다. 로그인 상태로 접근하면 phase-08의 resolvePostLoginPath()
 * 결과로 /home·/onboarding에 리다이렉트한다 — 분기는 이 페이지 컴포넌트가
 * 직접 하며 middleware.ts·lib/auth/routes.ts는 건드리지 않는다
 * (docs/adr/0012-landing-page-static.md 결정 4).
 *
 * createClient()가 세션 쿠키를 읽으므로 이 라우트는 dynamic으로 렌더된다.
 * 인기 책 랜덤 6권은 매 요청 새로 뽑힌다 (ADR-0012 결정 3·6).
 *
 * 의도 문서: docs/intent/screen-01-landing.md
 */
export default async function LandingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ADR-0012 결정 4 — 로그인 사용자는 도착 경로(/home·/onboarding)로 리다이렉트.
  if (user) {
    redirect(await resolvePostLoginPath(supabase, user.id));
  }

  // 비로그인 방문자 — 랜딩을 렌더한다.
  const copy = await getLandingCopy();

  // 인기 책 조회 실패가 마케팅 페이지 전체를 막지 않도록 방어한다.
  let books: PopularBook[] = [];
  try {
    books = await getPopularBooks(supabase);
  } catch (error) {
    console.error('LandingPage: 인기 책 조회 실패 —', error);
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <LandingHeader brandName={copy.brandName} copy={copy.header} />
      <main className="flex-1">
        <HeroSection copy={copy.hero} />
        <ValueProps items={copy.valueProps} />
        <PopularBooks copy={copy.popularSection} books={books} />
      </main>
      <LandingFooter brandName={copy.brandName} copy={copy.footer} />
    </div>
  );
}
