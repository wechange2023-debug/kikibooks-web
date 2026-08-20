import 'server-only';

/**
 * 자녀 미등록 상태 표면의 카피 단일 출처 (Single Source of Truth).
 *
 * ADR-0064 **O-K2 결론** — `lib/mypage/copy.ts` 패턴을 그대로 준용한다.
 * 컴포넌트는 카피를 직접 import하지 않는다. 페이지가 `getChildOptionalCopy()`를
 * 호출해 그 결과를 하위 컴포넌트에 props로 내려준다.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 사용 표면 2곳
 * ──────────────────────────────────────────────────────────────────────────────
 *   - `app/page.tsx` 갈래 2 → `components/main/no-child-main.tsx` (ADR-0064 D1)
 *   - `app/onboarding/page.tsx` "나중에 할게요" 링크 (ADR-0064 D3)
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * ★ 어휘 통일 (ADR-0064 O-K2 지시)
 * ──────────────────────────────────────────────────────────────────────────────
 *   마이페이지 자녀 0명 안내 화면(ADR-0063, `app/(reader)/mypage/page.tsx`)과
 *   **같은 상태·행동을 같은 낱말로** 부른다:
 *     - 상태를 가리키는 말 = **"자녀 프로필"** (× "아이 정보", × "프로필 등록")
 *     - 행동을 가리키는 말 = **"만들기"**     (× "등록하기", × "추가하기")
 *   CTA 라벨 `hero.ctaLabel`은 마이페이지 안내 화면의 버튼 문구와 **문자열이 같다**
 *   — 두 화면을 오가는 사용자가 같은 버튼을 두 번 배우지 않게 한다.
 *
 *   아이가 아니라 **보호자가 읽는 문구**다(design-system §8.2 "부모 단독" 영역).
 *   그래도 존댓말·짧은 문장 원칙(§8.1)은 유지한다.
 *
 * ★ CHILD_OPTIONAL_COPY 상수는 의도적으로 export하지 않는다 — 컴포넌트가 상수를
 *   직접 import하는 우회로를 컴파일 단계에서 차단한다(ADR-0012 결정 2 패턴).
 * ★ `import 'server-only'` — 이 모듈의 값은 서버에서만 읽힌다.
 *
 * ADR: docs/adr/0064-child-optional-registration.md (D1 · D3 · O-K2)
 */

/** 자녀 미등록 상태 표면 전체 카피. */
export interface ChildOptionalCopy {
  /** `/` 갈래 2의 상단 히어로 — MainHero 무수정 재사용(ADR-0064 O-K1). */
  hero: {
    /** 히어로 제목. 열람이 이미 열려 있음을 먼저 알린다. */
    title: string;
    /** 히어로 부제 — 자녀 프로필을 만들면 무엇이 더해지는지. */
    subtitle: string;
    /** CTA 라벨. 마이페이지 안내 화면 버튼과 **동일 문자열**(위 어휘 통일 주석). */
    ctaLabel: string;
  };
  /** 온보딩 건너뛰기 동선 (ADR-0064 D3). */
  onboardingSkip: {
    /** 폼 아래 Text 링크 라벨. */
    linkLabel: string;
    /**
     * 링크의 스크린리더 라벨 — "나중에 할게요"만으로는 무엇을 나중에 하는지
     * 화면을 못 보는 사용자에게 전달되지 않는다.
     */
    ariaLabel: string;
  };
}

/**
 * 카피 정본. export하지 않는다(위 주석 참조 — 컴포넌트 직접 import 차단).
 */
const CHILD_OPTIONAL_COPY: ChildOptionalCopy = {
  hero: {
    title: '그림책을 마음껏 둘러보세요',
    subtitle:
      '자녀 프로필을 만들면 읽은 책과 포인트가 쌓여요. 지금은 둘러보기만 할 수 있어요.',
    ctaLabel: '자녀 프로필 만들기',
  },
  onboardingSkip: {
    linkLabel: '나중에 할게요',
    ariaLabel: '자녀 프로필 만들기를 나중에 하고 둘러보기',
  },
};

/**
 * 자녀 미등록 상태 표면 카피를 반환한다.
 *
 * 지금은 정적 상수를 그대로 반환한다. 향후 Admin이 카피를 DB로 관리하게 되면
 * 본문만 DB 조회로 교체한다(시그니처·반환 타입 불변 — `getMypageCopy`와 동일 계약).
 */
export async function getChildOptionalCopy(): Promise<ChildOptionalCopy> {
  return CHILD_OPTIONAL_COPY;
}
