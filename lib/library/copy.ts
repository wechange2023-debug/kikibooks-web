import 'server-only';

import { CATEGORIES, type CategorySlug } from '@/lib/home/categories';

/**
 * 라이브러리 페이지(Screen 05 `/library`) 카피 단일 출처 (Single Source of Truth).
 *
 * ADR-0012 결정 2 패턴 정합 (BookDetailCopy·BookReaderCopy·CelebrateCopy 동형):
 *   - `import 'server-only'`: 클라이언트 번들 포함 시 빌드 실패 강제
 *   - 상수 LIBRARY_COPY 미export: 컴포넌트가 카피를 직접 import하는 우회로 컴파일 단계에서 차단
 *   - 페이지(app/library/page.tsx)가 getLibraryCopy()를 호출해 LibraryBrowser에 props 주입
 *
 * phase-13 CP3-a 신규 (ADR-0018 D10 + spec d10 — 화면별 카피 단일 책임 분리).
 *
 * 카테고리 옵션은 lib/home/categories.ts의 CATEGORIES.labelKo를 그대로 인용한다 —
 *   ADR-0015 단일 출처 정합. 라이브러리 필터의 카테고리는 홈 카테고리 그리드와 같은
 *   8 카테고리 매핑이며(동일 키워드 풀), 두 표면의 한국어 라벨은 같은 원본을 따른다.
 *   categories.ts가 갱신되면 본 모듈의 categoryOptions도 자동 반영된다(Object.fromEntries
 *   파생이 아닌 직접 map 인용 — 카테고리 추가/삭제는 categories.ts 단일 편집).
 *
 * phase-13b Admin DB 전환 시 getLibraryCopy() 본문만 library_copy 테이블 조회로 교체한다.
 *   시그니처·LibraryCopy 인터페이스 불변 → LibraryBrowser·page 수정 0건
 *   (getBookDetailCopy·getCelebrateCopy 동일 패턴).
 *
 * 의도 문서: docs/intent/screen-05-celebrate.md §5.3·§5.4·§6
 */

/** 레벨 필터 옵션 1건 — 1~5 값과 표시 라벨. */
export interface LibraryLevelOption {
  value: 1 | 2 | 3 | 4 | 5;
  label: string;
}

/** 카테고리 필터 옵션 1건 — categories.ts slug와 한국어 라벨. */
export interface LibraryCategoryOption {
  slug: CategorySlug;
  label: string;
}

/** 라이브러리 페이지 전체 카피. phase-13b의 library_copy 스키마가 이 형태를 따른다. */
export interface LibraryCopy {
  /** 페이지 메인 타이틀 (h1). */
  title: string;
  /** 페이지 보조 설명 (h1 아래 안내). */
  subtitle: string;
  filters: {
    /** 레벨 필터 그룹 라벨 (aria-label·legend). */
    levelLabel: string;
    /** 레벨 필터 '전체' 옵션 라벨 (필터 해제 = 모든 레벨). */
    levelAllLabel: string;
    /** 레벨 1~5 옵션 정본. */
    levelOptions: readonly LibraryLevelOption[];
    /** 카테고리 필터 그룹 라벨. */
    categoryLabel: string;
    /** 카테고리 '전체' 옵션 라벨. */
    categoryAllLabel: string;
    /** 카테고리 8 옵션 정본 (categories.ts CATEGORIES 인용). */
    categoryOptions: readonly LibraryCategoryOption[];
  };
  search: {
    /** input placeholder. */
    placeholder: string;
    /** input aria-label. */
    label: string;
    /** 검색·필터 초기화 버튼 라벨. */
    resetLabel: string;
  };
  empty: {
    /** 필터·검색 결과 0건 빈 상태 헤더. */
    title: string;
    /** 빈 상태 본문 안내. */
    body: string;
  };
  /** 무한 스크롤 sentinel 로딩 중 텍스트(aria-live). */
  loadingMore: string;
}

/** 레벨 1~5 옵션 정본 (design-system §1.8 매핑은 컴포넌트가 결정). */
const LEVEL_OPTIONS: readonly LibraryLevelOption[] = [
  { value: 1, label: 'Level 1' },
  { value: 2, label: 'Level 2' },
  { value: 3, label: 'Level 3' },
  { value: 4, label: 'Level 4' },
  { value: 5, label: 'Level 5' },
];

/**
 * 카테고리 옵션 정본 — categories.ts CATEGORIES를 그대로 옮긴다(slug·labelKo).
 * CATEGORIES 배열 순서(animals → bedtime)가 그대로 옵션 순서.
 */
const CATEGORY_OPTIONS: readonly LibraryCategoryOption[] = CATEGORIES.map((cat) => ({
  slug: cat.slug,
  label: cat.labelKo,
}));

/**
 * 라이브러리 카피 정본. export하지 않는다(BOOK_DETAIL_COPY와 동일 — 컴포넌트 직접
 * import 차단, ADR-0012 결정 2 패턴).
 */
const LIBRARY_COPY: LibraryCopy = {
  title: '책 라이브러리',
  subtitle: '레벨·카테고리·키워드로 다음 책을 찾아보세요.',
  filters: {
    levelLabel: '레벨',
    levelAllLabel: '전체',
    levelOptions: LEVEL_OPTIONS,
    categoryLabel: '카테고리',
    categoryAllLabel: '전체',
    categoryOptions: CATEGORY_OPTIONS,
  },
  search: {
    placeholder: '책 제목으로 검색…',
    label: '책 제목 검색',
    resetLabel: '초기화',
  },
  empty: {
    title: '찾는 책이 없어요',
    body: '필터를 줄이거나 다른 키워드로 다시 검색해보세요.',
  },
  loadingMore: '더 불러오는 중…',
};

/**
 * 라이브러리 페이지 카피를 반환한다.
 *
 * phase-13 — 정적 상수를 그대로 반환한다(getCelebrateCopy와 동일 패턴).
 * phase-13b — 본문을 library_copy 테이블 조회로 교체한다(시그니처·반환 타입 불변).
 */
export async function getLibraryCopy(): Promise<LibraryCopy> {
  return LIBRARY_COPY;
}
