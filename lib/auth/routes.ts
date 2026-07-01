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

/**
 * 공통 헤더(components/app/app-header.tsx) 네비 경로 — 홈 화면.
 * POST_LOGIN_PATH와 값은 같으나 의미가 다르다(리다이렉트 도착지 vs 네비 링크).
 * ADR-0021 D5 — 네비 경로 중앙화.
 */
export const HOME_PATH = '/home';

/** 공통 헤더 네비 경로 — 라이브러리 화면 (ADR-0021 D5). */
export const LIBRARY_PATH = '/library';

/**
 * 공통 헤더 네비 경로 — 쇼케이스(검수용) 화면.
 * 내부 검수 편의용 임시 메뉴 — 서비스 전환 시 제거 대상(app/showcase 삭제와 함께).
 * /showcase는 자체 로그인 가드만 두므로 PROTECTED_PREFIXES에는 추가하지 않는다.
 */
export const SHOWCASE_PATH = '/showcase';

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
