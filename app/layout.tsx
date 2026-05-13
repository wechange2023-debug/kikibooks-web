import type { Metadata } from 'next';
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google';
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
  title: 'Kikibooks',
  description: '한국 유아를 위한 무료 영어 그림책 e-라이브러리',
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
