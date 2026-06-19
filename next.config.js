/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // 책 표지 CDN 도메인 — phase-04(Book Dash)·phase-05(GDL) 동기화 출처.
    // next/image 최적화를 위해 등록한다 (docs/adr/0012-landing-page-static.md 결정 6).
    remotePatterns: [
      { protocol: 'https', hostname: 'bookdash.github.io' },
      { protocol: 'https', hostname: 'content.digitallibrary.io' },
      { protocol: 'https', hostname: 'africanstorybook.org' },
    ],
  },
};

module.exports = nextConfig;
