/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // 책 표지 CDN 도메인 — phase-04(Book Dash)·phase-05(GDL) 동기화 출처.
    // next/image 최적화를 위해 등록한다 (docs/adr/0012-landing-page-static.md 결정 6).
    remotePatterns: [
      { protocol: 'https', hostname: 'bookdash.github.io' },
      { protocol: 'https', hostname: 'bookdash.org' },
      { protocol: 'https', hostname: 'd3qawc7yl9x4zs.cloudfront.net' },
      { protocol: 'https', hostname: 'content.digitallibrary.io' },
      { protocol: 'https', hostname: 'africanstorybook.org' },
      // Bloom Library 표지·이미지 S3 (ADR-0028 Amd#4) — 버킷 경로로 제한.
      {
        protocol: 'https',
        hostname: 's3.amazonaws.com',
        pathname: '/bloomharvest/**',
      },
      {
        protocol: 'https',
        hostname: 's3.amazonaws.com',
        pathname: '/BloomLibraryBooks/**',
      },
    ],
  },
};

module.exports = nextConfig;
