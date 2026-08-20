import 'server-only';

import { cookies } from 'next/headers';

/**
 * 온보딩 "나중에 할게요" 기록 — **쿠키 단일 경로** (ADR-0064 **D3**).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 왜 쿠키인가 (D3 확정)
 * ──────────────────────────────────────────────────────────────────────────────
 *   `profiles`에 컬럼을 추가하면 DB 스키마 변경이 되어 **Hard Rule 8**(스키마 변경 시
 *   ADR 선행 + 팀장 사전 승인)이 발동한다. 쿠키는 스키마를 건드리지 않으면서
 *   "이 사람은 이미 한 번 거절했다"를 기억한다 — ADR-0064는 마이그레이션 0건이 합격 조건이다.
 *
 *   **한계는 명시한다**: 쿠키는 기기·브라우저 단위다. 다른 기기에서 로그인하면
 *   온보딩을 한 번 더 만난다. 이용이 막히는 것이 아니라 권유 화면이 한 번 더 뜨는
 *   것이므로 베타 규모에서는 감수한다. 재노출이 실제 불만으로 관측되면 `profiles`
 *   컬럼으로 승격하며, 그때는 **별도 ADR + 팀장 사전 승인**이 선행한다(D3 승격 조건).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 쿠키 속성 (ADR-0064 O-K3 결론)
 * ──────────────────────────────────────────────────────────────────────────────
 *   | 속성       | 값                          | 근거 |
 *   |------------|-----------------------------|------|
 *   | name       | `kiki_onboarding_skipped`   | 서비스 접두사로 다른 쿠키와 구분 |
 *   | value      | `'1'`                       | 존재 여부만 의미 있다. 값은 파싱하지 않는다 |
 *   | maxAge     | 365일                       | "한 번 거절" 기억이 세션보다 오래 살아야 D2가 성립 |
 *   | httpOnly   | true                        | 클라이언트 JS가 읽을 이유가 없다 |
 *   | sameSite   | `'lax'`                     | 최상위 GET 내비게이션에는 실려야 한다(로그인 후 `/` 도착) |
 *   | secure     | 프로덕션만                   | 로컬 http 개발에서 쿠키가 버려지는 것을 막는다 |
 *   | path       | `'/'`                       | `/onboarding`에서 심고 `/`·로그인 액션에서 읽는다 |
 *
 *   ★ 개인 식별 정보를 담지 않는다 — 값은 상수 `'1'`이며 사용자·자녀 식별자가 없다.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 이 쿠키가 하지 않는 일
 * ──────────────────────────────────────────────────────────────────────────────
 *   **권한 판정에 쓰지 않는다.** 이 값은 "온보딩 화면을 다시 보여줄지"라는 UX 힌트일
 *   뿐이고, 열람 가능 여부는 자녀 유무와 무관하게 이미 열려 있다(ADR-0064 A안).
 *   위조되더라도 얻어지는 것은 "온보딩 화면을 건너뛴다"뿐이라 보안 경계가 아니다 —
 *   데이터 보호의 최종 방어선은 RLS다(ADR-0009 3.4절).
 *
 * ADR: docs/adr/0064-child-optional-registration.md (D2 · D3 · O-K3)
 */

/** 쿠키 이름. 존재 여부만 의미가 있다. */
const SKIP_COOKIE_NAME = 'kiki_onboarding_skipped';

/** 쿠키 값. 파싱하지 않는다 — 있으면 스킵, 없으면 미스킵. */
const SKIP_COOKIE_VALUE = '1';

/** 365일. "한 번 거절"이 세션보다 오래 기억돼야 D2 분기가 성립한다. */
const SKIP_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * 온보딩을 건너뛴 적이 있는지 확인한다.
 *
 * `resolvePostLoginPath`(로그인 도착 분기)가 쓴다. 읽기 전용이라 Server Component·
 * Server Action·Route Handler 어디서든 호출할 수 있다.
 */
export function hasSkippedOnboarding(): boolean {
  return cookies().get(SKIP_COOKIE_NAME)?.value === SKIP_COOKIE_VALUE;
}

/**
 * 온보딩을 건너뛴 것으로 기록한다.
 *
 * ★ **Server Action 또는 Route Handler에서만 호출할 수 있다** — Next.js는 Server
 *   Component 렌더 중의 쿠키 쓰기를 허용하지 않는다. 현재 유일한 호출자는
 *   `app/onboarding/actions.ts`의 `skipOnboarding()`이다.
 */
export function markOnboardingSkipped(): void {
  cookies().set({
    name: SKIP_COOKIE_NAME,
    value: SKIP_COOKIE_VALUE,
    maxAge: SKIP_COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}
