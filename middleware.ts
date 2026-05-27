import { NextResponse, type NextRequest } from 'next/server';

import {
  POST_LOGIN_PATH,
  SIGN_IN_PATH,
  isAuthPage,
  isProtectedPath,
} from '@/lib/auth/routes';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * 전역 미들웨어 — 모든 요청에서 두 가지를 한다.
 *  1. Supabase 세션 쿠키 갱신 (updateSession)
 *  2. 보호 라우트 가드:
 *     - 보호 라우트인데 비로그인  → /login
 *     - /login·/signup인데 로그인 → /home
 *
 * ★ 미들웨어는 화면(UX) 차원의 가드다. 데이터 보안의 최종 방어선은
 *   DB의 RLS다 (docs/adr/0009-auth-architecture.md 3.4절).
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // 비로그인 사용자가 보호 라우트 접근 → 로그인 페이지로
  if (!user && isProtectedPath(pathname)) {
    return redirectKeepingCookies(request, SIGN_IN_PATH, response);
  }

  // 로그인 사용자가 인증 페이지 접근 → 홈으로
  if (user && isAuthPage(pathname)) {
    return redirectKeepingCookies(request, POST_LOGIN_PATH, response);
  }

  // 책 뷰어(/book/[id]/read) iframe 임베드 방어 — CSP frame-src 화이트리스트
  // (ADR-0017 D6). Book Dash·GDL 두 호스트만 임베드 허용. 두 외부 사이트 모두
  // X-Frame-Options·CSP frame-ancestors 부재(2026-05-22 HEAD 진단)라 방어 책임이
  // 키키북스 쪽에 있어 frame-src 한정이 핵심이다. Hard Rule 9(임의 임베드 금지)와 정합.
  // ※ frame-src 단일 디렉티브만 추가 — default-src 등 다른 CSP는 phase-12 범위 외.
  // 리다이렉트 응답(위 2분기)은 본문·iframe이 없어 CSP 미적용으로 충분하다.
  response.headers.set(
    'Content-Security-Policy',
    "frame-src 'self' https://bookdash.github.io https://content.digitallibrary.io",
  );

  return response;
}

/**
 * 리다이렉트하면서 updateSession이 갱신한 세션 쿠키를 잃지 않도록,
 * 새 리다이렉트 응답에 기존 응답의 쿠키를 복사한다.
 */
function redirectKeepingCookies(
  request: NextRequest,
  destination: string,
  sessionResponse: NextResponse,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = destination;
  url.search = '';

  const redirect = NextResponse.redirect(url);
  sessionResponse.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie);
  });
  return redirect;
}

/**
 * 미들웨어 실행 대상. 정적 파일·이미지·favicon은 제외한다.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
