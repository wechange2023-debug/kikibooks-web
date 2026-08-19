/**
 * 법적 고지 링크·문구 단일 출처 (Single Source of Truth).
 *
 * 결정 근거: ADR-0061 D3 — CC BY 안내 문구는 원래 `lib/landing/copy.ts`의
 *   `LANDING_COPY` 안에 있었고, 그 상수는 **의도적으로 export되지 않는다**
 *   (`copy.ts:60` 주석 — "컴포넌트 직접 import 차단"). 공개 API는 `getLandingCopy()`
 *   하나뿐이라, (reader)·showcase 푸터가 이 문구를 쓰려면 랜딩 카피에 결합돼야 했다.
 *   그래서 문구를 본 모듈로 승격하고 **랜딩 푸터와 공통 푸터가 둘 다 여기를 참조**한다.
 *
 * ★ `import 'server-only'`를 붙이지 않는다 — `components/app/app-footer.tsx`가
 *   'use client'(usePathname 분기, ADR-0061 D4)라 서버 전용으로 잠그면 안 된다.
 *   `lib/brand.ts`와 같은 이유·같은 규칙이다.
 *
 * 사용 규칙: 약관·개인정보 경로와 라벨, CC BY 안내 문구를 화면에 쓸 때는 문자열을
 *   새로 쓰지 말고 반드시 본 상수를 참조한다.
 */

/** 이용약관 라우트. */
export const TERMS_PATH = '/terms';

/** 개인정보처리방침 라우트. */
export const PRIVACY_PATH = '/privacy';

/** 이용약관 링크 라벨. */
export const TERMS_LABEL = '이용약관';

/** 개인정보처리방침 링크 라벨. */
export const PRIVACY_LABEL = '개인정보처리방침';

/**
 * CC BY 안내 문구 — 표지를 노출하는 화면의 **어트리뷰션 하한선**(ADR-0013 결정 2).
 *
 * 4요소 완전 표시 의무는 책 상세 페이지가 진다(ADR-0013 결정 3). 본 문구는 그
 * 하한선일 뿐이며, AttributionBox를 대체하지 않는다.
 *
 * 문구는 v1 랜딩 푸터에서 그대로 이관했다 — 내용 변경 0건(ADR-0061 D2).
 */
export const CC_BY_NOTICE =
  '모든 도서는 CC BY 4.0 라이선스이며, 글·그림 저작자와 원본 출처는 각 책 상세 페이지에 표시됩니다.';

/**
 * 사업자 표기 — v1에서는 랜딩 푸터에만 있었다(`lib/landing/copy.ts` footer.companyName).
 *
 * ADR-0062 **O-M3 확정**으로 `AppFooter`가 전 화면에 노출한다. 전자상거래법상
 * 표기 의무는 유료 결제 도입 시 발생하나, 미리 전 화면에 두는 편이 유리하다
 * (ADR-0061 O-F2 해소).
 */
export const COMPANY_NAME = '주식회사 위체인지 (WECHANGE)';

/** 저작권 표기. 위와 같은 사유로 공용 상수로 승격했다. */
export const COPYRIGHT = '© 2026 주식회사 위체인지';
