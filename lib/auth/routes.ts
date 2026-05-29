/**
 * 보호/공개 라우트 정의 — middleware.ts가 사용한다.
 *
 * 의도 문서: docs/intent/auth-flow.md 3절(라우트 지도)·4.5절(보호 라우트)
 * 결정 근거: docs/adr/0009-auth-architecture.md 3.4절(미들웨어 중앙 가드)
 */

/** 로그인해야만 들어갈 수 있는 경로의 접두사 목록. */
export const PROTECTED_PREFIXES = ['/home', '/onboarding', '/library', '/book', '/admin'] as const;

/** 로그인한 사용자에게는 다시 보여주지 않는 인증 페이지. */
export const AUTH_PAGES = ['/login', '/signup'] as const;

/** 로그인 성공 후 자녀가 이미 있을 때의 도착 경로. */
export const POST_LOGIN_PATH = '/home';

/** 로그인 성공 후 자녀가 없을 때 보내는 온보딩 경로 (phase-08). */
export const ONBOARDING_PATH = '/onboarding';

/** 비로그인 사용자가 보호 라우트에 접근했을 때 보내는 경로. */
export const SIGN_IN_PATH = '/login';

/** 주어진 경로가 보호 라우트인지 판정한다. (정확히 일치하거나 하위 경로) */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** 주어진 경로가 인증 페이지(/login·/signup)인지 판정한다. */
export function isAuthPage(pathname: string): boolean {
  return (AUTH_PAGES as readonly string[]).includes(pathname);
}
