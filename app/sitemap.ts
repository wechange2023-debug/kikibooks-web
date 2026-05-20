import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/site';

/**
 * sitemap.xml — 검색엔진에 공개하는 페이지 목록.
 *
 * 색인 허용 대상(robots.ts와 정합)인 공개 페이지 3개만 포함한다.
 * 로그인 후 경로는 closed environment 정책상 제외한다 (ADR-0013 결정 4).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
