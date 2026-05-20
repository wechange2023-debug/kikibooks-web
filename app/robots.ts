import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/site';

/**
 * robots.txt — 검색엔진 색인 정책 (ADR-0013 결정 4, PLAN.md 15절 closed environment).
 *
 * 마케팅·법적 페이지(/, /terms, /privacy)는 색인을 허용하고, 로그인 후
 * 콘텐츠·읽기 경로(/home·/book·/library·/onboarding 등)는 색인을 차단한다 —
 * "닫힌 환경(closed environment)"은 향후 출판사 협상의 자산이다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/home',
        '/onboarding',
        '/library',
        '/book',
        '/login',
        '/signup',
        '/auth',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
