import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/site';

/**
 * robots.txt — 검색엔진 색인 정책 (ADR-0013 결정 4, PLAN.md 15절 closed environment).
 *
 * 마케팅·법적 페이지(/, /terms, /privacy)는 색인을 허용하고, 로그인 후
 * 콘텐츠·읽기 경로(/book·/library·/onboarding 등)는 색인을 차단한다 —
 * "닫힌 환경(closed environment)"은 향후 출판사 협상의 자산이다.
 *
 * ★ ADR-0062 D7 — `/home`을 disallow 목록에서 뺐다. 라우트가 사라지고 `/`로
 *   흡수됐기 때문이다(D2). `/`는 계속 allow인데, **크롤러는 비로그인이라 `/`에서
 *   마케팅 랜딩만 본다** — 로그인 후 콘텐츠 블록은 세션이 있어야 렌더되므로
 *   closed environment(ADR-0013 결정 4)는 그대로 유지된다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/onboarding',
        '/library',
        '/book',
        '/login',
        '/signup',
        '/auth',
        '/admin',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
