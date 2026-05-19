import 'server-only';

/**
 * 랜딩 페이지(Screen 01) 카피 단일 출처 (Single Source of Truth).
 *
 * ADR-0012 결정 2 — 랜딩의 모든 문구는 이 파일에서만 정의한다.
 * 컴포넌트는 카피를 직접 import하지 않는다. `/` 페이지가 getLandingCopy()를
 * 호출해 그 결과를 하위 컴포넌트에 props로 내려준다.
 *
 * phase-13b에서 Admin이 카피를 DB(landing_copy 테이블)로 관리하게 되면
 * getLandingCopy()의 본문만 DB 조회로 교체한다. LandingCopy 인터페이스와
 * 컴포넌트 props는 그대로이므로 컴포넌트 수정이 0건이다.
 *
 * ★ LANDING_COPY 상수는 의도적으로 export하지 않는다 — 컴포넌트가 상수를
 *   직접 import하는 우회로를 컴파일 단계에서 차단한다(ADR-0012 결정 2).
 * ★ `import 'server-only'` — 이 모듈의 값은 서버에서만 읽힌다. 컴포넌트는
 *   `import type { LandingCopy }`(타입 전용, 런타임 제거)만 사용한다.
 *
 * 의도 문서: docs/intent/screen-01-landing.md 5절(화면 구성)
 */

/** 핵심 가치 카드 1개. iconKey는 컴포넌트가 아이콘으로 매핑한다(아이콘 라이브러리 비의존). */
export interface LandingValueProp {
  iconKey: 'books' | 'age' | 'safe' | 'free';
  title: string;
  description: string;
}

/** 랜딩 페이지 전체 카피. phase-13b의 landing_copy DB 스키마가 이 형태를 따른다. */
export interface LandingCopy {
  brandName: string;
  header: {
    loginLabel: string;
    signupLabel: string;
  };
  hero: {
    title: string;
    subtitle: string;
    ctaLabel: string;
  };
  /** 핵심 가치 4개 — 배열 순서 = 화면 노출 순서. */
  valueProps: LandingValueProp[];
  popularSection: {
    heading: string;
    subheading: string;
  };
  footer: {
    companyName: string;
    copyright: string;
    /** ADR-0013 결정 2 — 표지 노출 화면의 CC BY 안내 문구. */
    attributionNotice: string;
    termsLabel: string;
    privacyLabel: string;
  };
}

/**
 * 랜딩 카피 정본. export하지 않는다(위 주석 참조 — 컴포넌트 직접 import 차단).
 *
 * 핵심 가치 ① "890권이 넘는 영어 그림책" — ADR-0012 결정 5.
 *   현재 적재량 896권, 안전 마진으로 "890권" 표기. 적재량 증가 시 이 줄만 갱신.
 */
const LANDING_COPY: LandingCopy = {
  brandName: 'Kikibooks',
  header: {
    loginLabel: '로그인',
    signupLabel: '무료로 시작하기',
  },
  hero: {
    title: '우리 아이의 첫 영어 그림책 서재',
    subtitle:
      '만 3~7세 아이를 위한 무료 영어 그림책. 광고 없이, 안심하고 보여주세요.',
    ctaLabel: '무료로 시작하기',
  },
  valueProps: [
    {
      iconKey: 'books',
      title: '890권이 넘는 영어 그림책',
      description:
        '전 세계 비영리 단체가 만든 무료 영어 그림책을 한자리에 모았어요.',
    },
    {
      iconKey: 'age',
      title: '나이별 맞춤 추천',
      description: '아이 나이에 맞는 난이도의 그림책을 골라 보여드려요.',
    },
    {
      iconKey: 'safe',
      title: '광고 없이 안심',
      description: '광고도, 결제 유도도 없어요. 아이가 안전하게 보는 화면이에요.',
    },
    {
      iconKey: 'free',
      title: '무료로 시작',
      description: '회원가입만 하면 모든 그림책을 무료로 볼 수 있어요.',
    },
  ],
  popularSection: {
    heading: '그림책 미리 만나보기',
    subheading: '회원가입하면 모든 그림책을 무료로 볼 수 있어요.',
  },
  footer: {
    companyName: '주식회사 위체인지 (WECHANGE)',
    copyright: '© 2026 주식회사 위체인지',
    attributionNotice:
      '모든 도서는 CC BY 4.0 라이선스이며, 글·그림 저작자와 원본 출처는 각 책 상세 페이지에 표시됩니다.',
    termsLabel: '이용약관',
    privacyLabel: '개인정보처리방침',
  },
};

/**
 * 랜딩 페이지 카피를 반환한다.
 *
 * phase-09a — 정적 상수를 그대로 반환한다.
 * phase-13b — 본문을 landing_copy 테이블 조회로 교체한다(시그니처·반환 타입 불변).
 */
export async function getLandingCopy(): Promise<LandingCopy> {
  return LANDING_COPY;
}
