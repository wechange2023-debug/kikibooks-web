/**
 * 보호/공개 라우트 정의 — middleware.ts가 사용한다.
 *
 * 의도 문서: docs/intent/auth-flow.md 3절(라우트 지도)·4.5절(보호 라우트)
 * 결정 근거: docs/adr/0009-auth-architecture.md 3.4절(미들웨어 중앙 가드)
 */

/**
 * 로그인해야만 들어갈 수 있는 경로의 접두사 목록.
 *
 * ★ ADR-0062 D3 — `'/home'`을 **제거**했다. `/home`은 `next.config.js` redirects가
 *   `/`로 308 보내는 경로가 되었고(D2), `/`는 공개 라우트다. 목록에 남겨두면
 *   비로그인 `/home` 북마크가 `/login`으로 새어 D2 합격 기준을 깬다.
 *   (실측: redirects가 미들웨어보다 먼저 평가되나, 목록에서도 빼 이중으로 막는다.)
 */
export const PROTECTED_PREFIXES = [
  '/onboarding',
  '/library',
  '/book',
  '/mypage',
  '/admin',
] as const;

/** 로그인한 사용자에게는 다시 보여주지 않는 인증 페이지. */
export const AUTH_PAGES = ['/login', '/signup'] as const;

/**
 * 로그인 성공 후 자녀가 이미 있을 때의 도착 경로.
 *
 * ★ ADR-0062 D3 — `/home`에서 **`/`로 전환**했다. `/`가 단일 메인이며 로그인 상태면
 *   개인화 블록을 렌더한다. 자녀 0명은 여전히 ONBOARDING_PATH다(D4).
 */
export const POST_LOGIN_PATH = '/';

/**
 * 공통 헤더(components/app/app-header.tsx) 네비 경로 — 메인(홈) 화면.
 * POST_LOGIN_PATH와 값은 같으나 의미가 다르다(리다이렉트 도착지 vs 네비 링크).
 * ADR-0021 D5 — 네비 경로 중앙화. ADR-0062 D3 — `/home` → `/`.
 *
 * ★ **활성 판정은 정확 일치(`===`)만 쓴다** (ADR-0062 **O-M4 확정**).
 *   값이 `/`가 되었으므로 `startsWith(HOME_PATH)`로 바꾸면 **모든 경로에서 홈이 활성**이
 *   된다. `app-header.tsx`의 홈 링크 isActive를 수정할 때 반드시 확인할 것.
 */
export const HOME_PATH = '/';

/** 공통 헤더 네비 경로 — 라이브러리 화면 (ADR-0021 D5). */
export const LIBRARY_PATH = '/library';

/**
 * 공통 헤더 네비 경로 — 마이페이지 (ADR-0024 D1·D6).
 * 로그인 후 개인 화면이므로 PROTECTED_PREFIXES에도 함께 등재한다
 * (ADR-0024 Amendment O4 — 라우트 생성과 같은 작업 단위에서 추가).
 */
export const MYPAGE_PATH = '/mypage';

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

/**
 * 회원가입 경로. 비로그인 방문자를 가입 동선으로 보낼 때 쓴다.
 *
 * ADR-0062 **O-M2** — 메인의 카테고리 타일은 로그인 시 `/library?category=`,
 * 비로그인 시 본 경로로 간다. `/library`가 보호 라우트라 비로그인이 누르면
 * `/login`으로 튀어 카테고리가 미끼로만 끝나기 때문이다.
 * `AUTH_PAGES`에 이미 값이 있으나 의미가 달라(가드 목록 vs 링크 대상) 상수를 분리한다
 * — `HOME_PATH`/`POST_LOGIN_PATH`와 같은 선례다.
 */
export const SIGNUP_PATH = '/signup';

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

/**
 * 책 읽기(/read)·완독(/celebrate)·단어 놀이(/wordplay)·책 퀴즈(/quiz) 몰입 화면 —
 * 공통 헤더·푸터 **둘 다** 미렌더 대상. 정확한 세그먼트 매칭이라 `/book/[id]`(상세)
 * 자신은 걸리지 않는다.
 *
 * ★ `wordplay` 추가 (ADR-0065 Amendment #2 D-B1 · Q-1): 단어 놀이는 **원래 celebrate
 *   안에서** 렌더됐고 celebrate는 이미 몰입 화면이었다. 전용 URL로 옮기면서 화면의 겉모습을
 *   바꾸지 않으려면 같은 대우가 필요하다 — 옮겼더니 헤더·푸터가 새로 생기는 것은 이동이
 *   아니라 변경이다. 아이가 노는 화면에 법적 링크 푸터를 붙일 이유도 없다.
 *
 * ★ `quiz` 추가 (Q-2b): 같은 계열의 놀이 화면이다. celebrate 허브에서 갈라지는 두 갈래를
 *   서로 다르게 대우할 이유가 없다.
 *
 * ★ ADR-0061 D4 — 이 정규식을 복제하지 않는다. 복제하면 한쪽만 고쳐지는 순간
 *   헤더는 숨고 푸터는 남는 상태가 된다. `AppHeader`(ADR-0021 D3)와 `AppFooter`가
 *   같은 상수를 공유한다.
 *
 * 알려진 한계(ADR-0021 D3 승계): `/book/[id]` not-found는 책 상세와 URL이 같아
 *   (`notFound()`는 요청 URL을 그대로 렌더) usePathname으로 구별할 수 없다.
 *   따라서 not-found에서는 헤더·푸터가 노출된다.
 */
export const IMMERSIVE_ROUTE_RE = /^\/book\/[^/]+\/(read|celebrate|wordplay|quiz)$/;

/** 몰입 화면(헤더·푸터 미렌더)인지 판정한다. */
export function isImmersiveRoute(pathname: string): boolean {
  return IMMERSIVE_ROUTE_RE.test(pathname);
}
