/** @type {import('next').NextConfig} */

// Supabase Storage 호스트는 NEXT_PUBLIC_SUPABASE_URL에서 파생(하드코딩 금지, ADR-0032 STEP 3).
// book-covers 버킷 이관 표지(Book Dash)를 next/image로 최적화하기 위함.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig = {
  reactStrictMode: true,
  /**
   * ADR-0062 D2 — `/home`은 `/`로 흡수됐다. 기존 북마크·외부 링크를 보호하기 위해
   * 라우트를 지우고 **영구 리다이렉트(308)** 만 남긴다.
   *
   * ★ 여기(next.config)에 두는 근거는 실측이다(O-M1, Next 14.2.35):
   *   redirects()가 **미들웨어보다 먼저** 평가된다 — 비로그인 `/home` 진입이
   *   308로 `/`에 홉 1회로 도착하고 `/login`을 경유하지 않는다.
   *   (대조군: `/library`·`/mypage`는 미들웨어가 307로 `/login`에 보낸다.)
   *   페이지의 permanentRedirect()보다 싸다 — 렌더 없이 edge에서 끝난다.
   */
  async redirects() {
    return [{ source: '/home', destination: '/', permanent: true }];
  },
  images: {
    // Vercel 이미지 최적화 한도 소진으로 표지가 전량 402(OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED)
    // 응답을 받아 미출력됐다(2026-08-06 진단: 표본 28건 중 402 28건 / 200은 캐시 HIT 2건뿐).
    // 도메인·경로 무관하게 자체 Supabase Storage 표지까지 동일 실패 → 최적화 경유 자체를 끈다.
    // 원본 URL 직결 서빙이므로 한도를 소비하지 않는다. 전송량 최적화는 표지 자체 호스팅
    // (webp 사전 변환) 트랙에서 별도 처리한다.
    unoptimized: true,
    // 책 표지 CDN 도메인 — phase-04(Book Dash)·phase-05(GDL) 동기화 출처.
    // next/image 최적화를 위해 등록한다 (docs/adr/0012-landing-page-static.md 결정 6).
    // unoptimized: true 상태에서는 미사용이나, 최적화 복귀 시 필요하므로 보존한다.
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
