/** @type {import('next').NextConfig} */

// Supabase Storage 호스트는 NEXT_PUBLIC_SUPABASE_URL에서 파생(하드코딩 금지, ADR-0032 STEP 3).
// book-covers 버킷 이관 표지(Book Dash)를 next/image로 최적화하기 위함.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

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
      // Supabase Storage(book-covers 등 public 버킷) — 이관 표지 (ADR-0032 STEP 3).
      ...(supabaseHost
        ? [
            {
              protocol: 'https',
              hostname: supabaseHost,
              pathname: '/storage/v1/object/public/**',
            },
          ]
        : []),
    ],
  },
};

module.exports = nextConfig;
