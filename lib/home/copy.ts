import 'server-only';

/**
 * 홈 페이지(Screen 02 `/home`) 카피 단일 출처 (Single Source of Truth).
 *
 * ADR-0012 결정 2 패턴 계승 — 홈의 모든 문구는 이 파일에서만 정의한다.
 * 컴포넌트는 카피를 직접 import하지 않는다. `/home` 페이지가 getHomeCopy()를
 * 호출해 그 결과를 하위 컴포넌트에 props로 내려준다.
 *
 * phase-13b에서 Admin이 카피를 DB(home_copy 테이블)로 관리하게 되면
 * getHomeCopy()의 본문만 DB 조회로 교체한다. HomeCopy 인터페이스와
 * 컴포넌트 props는 그대로이므로 컴포넌트 수정이 0건이다.
 *
 * ★ HOME_COPY 상수는 의도적으로 export하지 않는다 — 컴포넌트가 상수를
 *   직접 import하는 우회로를 컴파일 단계에서 차단한다(ADR-0012 결정 2 패턴).
 * ★ `import 'server-only'` — 이 모듈의 값은 서버에서만 읽힌다.
 * ★ 인사 카드 메인 카피는 `{name}` 자리표시자를 가진 템플릿 문자열로 박제한다
 *   (landing/copy.ts와 동일 패턴, DB 교체 호환). buildGreeting()이 치환한다.
 *
 * 의도 문서: docs/intent/screen-02-home.md 5절(5개 구성요소 명세)
 */

/** 홈 페이지 전체 카피. phase-13b의 home_copy DB 스키마가 이 형태를 따른다. */
export interface HomeCopy {
  greeting: {
    /** display_name이 있을 때 — `{name}`은 display_name. */
    withName: string;
    /** display_name이 NULL일 때 — `{name}`은 첫 번째 자녀 이름 (cp1_decisions d1). */
    nameOnly: string;
    subtitle: string;
  };
  recommendations: {
    title: string;
    /** 폴백 사다리 5단계(빈 상태)에서 표시 (cp1_decisions d5). */
    empty: string;
  };
  categories: {
    title: string;
    /** 결과 0건 카테고리 진입 시 표시 (ADR-0015 결정 6). */
    emptyState: string;
    closeLabel: string;
    /**
     * /home?cat={slug} 진입 시 결과 페이지 미구현 안내 카드 카피 (cp3_decisions d23).
     * `{label}` 자리표시자는 page.tsx에서 CATEGORIES의 labelKo로 1회 치환.
     * phase-13b 라이브러리 결과 페이지 구현 시 본 카피는 제거 또는 0건 폴백으로 재활용.
     * ADR-0012 결정 2(카피 단일 출처) 정합 — 컴포넌트가 상수 직접 import 안 함.
     */
    comingSoonTemplate: string;
  };
  levelSelector: {
    title: string;
  };
  streak: {
    title: string;
    /** 최근 7일 완독 0건일 때 표시 (intent §5.5). */
    empty: string;
  };
}

/**
 * 홈 카피 정본. export하지 않는다(위 주석 참조 — 컴포넌트 직접 import 차단).
 *
 * 메인 카피의 `{name}` 자리표시자는 buildGreeting()이 치환한다.
 */
const HOME_COPY: HomeCopy = {
  greeting: {
    withName: '안녕하세요, {name}님 👋',
    nameOnly: '{name} 부모님 👋',
    subtitle: '오늘도 함께 책을 펼쳐볼까요?',
  },
  recommendations: {
    title: '오늘의 추천',
    empty: '아직 추천할 책이 부족해요. 카테고리에서 둘러보세요!',
  },
  categories: {
    title: '카테고리',
    emptyState: '이 카테고리에 아직 책이 없어요. 다른 카테고리를 둘러보세요!',
    closeLabel: '닫기',
    comingSoonTemplate: '{label} 카테고리 결과는 곧 추가될 예정이에요.',
  },
  levelSelector: {
    title: '레벨',
  },
  streak: {
    title: '최근 7일',
    empty: '오늘부터 시작해볼까요?',
  },
};

/**
 * 홈 페이지 카피를 반환한다.
 *
 * phase-10 — 정적 상수를 그대로 반환한다.
 * phase-13b — 본문을 home_copy 테이블 조회로 교체한다(시그니처·반환 타입 불변).
 */
export async function getHomeCopy(): Promise<HomeCopy> {
  return HOME_COPY;
}
