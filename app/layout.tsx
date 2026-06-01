import type { Metadata } from 'next';
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google';

import { SITE_URL } from '@/lib/site';

import './globals.css';

// docs/design-system.md 2.1 — Display/Body 폰트. 한글은 Pretendard 폴백.
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  fallback: ['Pretendard', 'Georgia', 'serif'],
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  fallback: ['Pretendard', 'system-ui', 'sans-serif'],
  display: 'swap',
});

export const metadata: Metadata = {
  // 사이트 전역 절대 URL 기준 — OG/Twitter 이미지 등 모든 페이지가 상속한다.
  // 정식 도메인은 phase-14에서 NEXT_PUBLIC_SITE_URL 설정으로 일괄 정정 (lib/site.ts).
  metadataBase: new URL(SITE_URL),
  title: 'Kikibooks',
  description: '한국 유아를 위한 무료 영어 그림책 e-라이브러리',
  // phase-14 CP4 — 전역 OG 한국어 기본값. openGraph/twitter는 페이지가 정의하면
  // 그 객체로 전체 덮어쓴다(Next.js metadata는 nested 객체 deep merge 0건). 따라서
  // 랜딩(app/page.tsx)은 자체 완전 openGraph로 덮어쓰고, 자체 openGraph 미정의 페이지
  // (home·library 등)는 본 한국어 기본값(siteName·ko_KR·website)을 상속한다.
  openGraph: {
    siteName: 'Kikibooks',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={`${fraunces.variable} ${plusJakarta.variable}`}>
      <body className="font-body">{children}</body>
    </html>
  );
}
