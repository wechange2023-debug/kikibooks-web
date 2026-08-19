import type { Metadata } from 'next';
import { Gothic_A1, Plus_Jakarta_Sans } from 'next/font/google';

import { BRAND_NAME } from '@/lib/brand';
import { SITE_URL } from '@/lib/site';

import './globals.css';

/**
 * docs/design-system.md v2 §2.1 — Display/Body 폰트.
 *
 * Display = Gothic A1 (v1의 Fraunces 폐기 — ADR-0060 D2-b). 한글·라틴을 한 폰트로
 * 처리해 헤드라인 서체 혼합이 일어나지 않는다. weight는 §2.3의 800 금지 규칙에 따라
 * 500·700 두 종만 로드한다.
 *
 * Body = Plus Jakarta Sans 유지(라틴) + Gothic A1 한글 폴백. PJS에는 한글 글리프가
 * 없으므로 브라우저가 글리프 단위로 폴백해 라틴은 PJS, 한글은 Gothic A1이 렌더된다.
 * 이 합성은 tailwind.config.ts의 fontFamily.body 스택이 담당한다(§10.2).
 *
 * ★ Pretendard는 v1 내내 로드된 적이 없다(@font-face·CDN·public 폰트 파일 0건).
 *   ADR-0060 D2-b에 따라 스택에 남기되, 실제 로드되는 Gothic A1 **뒤**에 둔다 —
 *   로컬 설치 여부에 따라 사용자마다 다른 서체로 보이는 것을 막는다.
 *
 * subsets는 font-data.json이 노출하는 값만 지정 가능하다(Gothic A1은 'latin'뿐).
 * 한글 글리프는 unicode-range 청크로 함께 self-host되며 preload 대상만 아니다.
 */
const gothicA1 = Gothic_A1({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-display',
  fallback: ['Pretendard', 'system-ui', 'sans-serif'],
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
  title: BRAND_NAME,
  description: '한국 유아를 위한 무료 영어 그림책 e-라이브러리',
  // phase-14 CP4 — 전역 OG 한국어 기본값. openGraph/twitter는 페이지가 정의하면
  // 그 객체로 전체 덮어쓴다(Next.js metadata는 nested 객체 deep merge 0건). 따라서
  // 랜딩(app/page.tsx)은 자체 완전 openGraph로 덮어쓰고, 자체 openGraph 미정의 페이지
  // (home·library 등)는 본 한국어 기본값(siteName·ko_KR·website)을 상속한다.
  openGraph: {
    siteName: BRAND_NAME,
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
    <html lang="ko" className={`${gothicA1.variable} ${plusJakarta.variable}`}>
      <body className="font-body">{children}</body>
    </html>
  );
}
