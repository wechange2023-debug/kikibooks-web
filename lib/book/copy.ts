import 'server-only';

/**
 * 책 상세 페이지(Screen 03 `/book/[id]`) 카피 단일 출처 (Single Source of Truth).
 *
 * ADR-0016 결정 3 — AttributionBox 5요소 라벨·CC BY 안내·source_platform/license
 *                  한국어명·라이선스 URL 매핑을 본 모듈이 단일 박제한다.
 * ADR-0012 결정 2 패턴 계승 — 책 상세의 모든 문구는 이 파일에서만 정의한다.
 *                  컴포넌트는 카피를 직접 import하지 않는다. `/book/[id]` 페이지가
 *                  getBookDetailCopy()를 호출해 그 결과를 하위 컴포넌트에 props로
 *                  내려준다.
 *
 * phase-13b에서 Admin이 카피를 DB로 관리하게 되면 getBookDetailCopy()의 본문만
 * DB 조회로 교체한다. BookDetailCopy 인터페이스와 컴포넌트 props는 그대로이므로
 * 컴포넌트 수정이 0건이다.
 *
 * ★ BOOK_DETAIL_COPY 상수는 의도적으로 export하지 않는다 — 컴포넌트가 상수를
 *   직접 import하는 우회로를 컴파일 단계에서 차단한다(ADR-0012 결정 2 패턴).
 * ★ `import 'server-only'` — 이 모듈의 값은 서버에서만 읽힌다.
 *
 * 카피 동기화 주의:
 *   - attribution.ccByNotice는 lib/landing/copy.ts의 footer.attributionNotice와
 *     동일 문안이다(ADR-0013 결정 2 표지 노출 화면 공통 안내). 두 파일을 함께
 *     수정해야 한다 — 본 위치에 일부러 박제하는 사유는 lib/landing/copy.ts의
 *     module-private 정합(LandingCopy 독립)을 유지하기 위함이다. phase-13b에서
 *     공통 카피 테이블 도입 시 단일 출처로 통합.
 *
 * 매핑 키 타입 규약 (lib/book/detail.ts Book 인터페이스 정합):
 *   - sourcePlatformNames: Record<string, string> — Book.source_platform이 string
 *   - licenseNames / licenseUrls: Record<string, string> — Book.license가 string
 *   - 키 누락 시 헬퍼(attribution.ts) 안에서 raw 값 폴백
 *
 * 의도 문서: docs/intent/screen-03-book-detail.md §5.3
 */

/** 책 상세 페이지 전체 카피. phase-13b의 book_detail_copy 스키마가 이 형태를 따른다. */
export interface BookDetailCopy {
  attribution: {
    /**
     * AttributionBox 5요소 행 라벨.
     *
     * ADR-0016 결정 1-가: illustrator NULL 시 illustrator 행 DOM 생략 — 라벨은 박제 유지.
     * ADR-0016 결정 2-나: source_platform='gdl' 시 author 행 생략 + publisher 행 추가.
     * ADR-0016 결정 3: 5요소는 PLAN.md 9절 + license-rules.md §5.1 명세.
     *                  '제목' 누락은 H1 통합 어트리뷰션 단위로 보완(BookCoverHero H1).
     *                  '출처' 추가는 큐레이션 투명성 + 표준 포맷 정합.
     */
    rowLabels: {
      source: string;
      author: string;
      illustrator: string;
      publisher: string;
      license: string;
      originalLink: string;
    };
    /**
     * ADR-0013 결정 2 — 표지 노출 화면 공통 CC BY 안내.
     * lib/landing/copy.ts footer.attributionNotice와 동일 문안.
     */
    ccByNotice: string;
  };
  readButton: {
    /** phase-11에서는 자리만 — phase-12 책 뷰어 활성화 시 클릭 동작 부착. */
    label: string;
  };
  /**
   * 공통 404 페이지 카피 — 블랙리스트(ADR-0014 Amendment #4)·books 행 NULL·RLS 차단
   * 3 케이스 모두 동일 UX로 렌더한다(사용자에게 사유 구분 미노출, intent §5.5).
   */
  notFound: {
    title: string;
    body: string;
    homeLinkLabel: string;
  };
  /**
   * source_platform DB 값 → 사용자 표시 한국어명.
   * 키 누락 시 호출 측(attribution.ts)에서 raw 값을 폴백 표시한다.
   */
  sourcePlatformNames: Record<string, string>;
  /**
   * license DB 값 → 사용자 표시 한국어명.
   * 키 누락 시 호출 측에서 raw 값 폴백.
   */
  licenseNames: Record<string, string>;
  /**
   * license DB 값 → 라이선스 공식 URL (외부 새 탭 오픈).
   * license-rules.md §4.1·§4.2 박제. Public Domain은 URL 없음 — 빈 문자열.
   */
  licenseUrls: Record<string, string>;
}

/**
 * 책 상세 카피 정본. export하지 않는다(위 주석 — 컴포넌트 직접 import 차단).
 */
const BOOK_DETAIL_COPY: BookDetailCopy = {
  attribution: {
    rowLabels: {
      source: '📚 출처',
      author: '✍️ 글',
      illustrator: '🎨 그림',
      publisher: '🏢 출판사',
      license: '📜 라이선스',
      originalLink: '🔗 원본 보기',
    },
    ccByNotice:
      '모든 도서는 CC BY 4.0 라이선스이며, 글·그림 저작자와 원본 출처는 각 책 상세 페이지에 표시됩니다.',
  },
  readButton: {
    label: '📖 읽기 시작',
  },
  notFound: {
    title: '찾을 수 없는 책이에요',
    body: '이 책은 더 이상 표시되지 않거나, 주소가 잘못된 것 같아요.',
    homeLinkLabel: '홈으로 돌아가기',
  },
  sourcePlatformNames: {
    book_dash: 'Book Dash',
    gdl: 'Global Digital Library',
  },
  licenseNames: {
    'cc-by-4-0': 'CC BY 4.0',
    'cc-by-sa-4-0': 'CC BY-SA 4.0',
    cc0: 'CC0 (Public Domain Dedication)',
    'public-domain': 'Public Domain',
  },
  licenseUrls: {
    'cc-by-4-0': 'https://creativecommons.org/licenses/by/4.0/',
    'cc-by-sa-4-0': 'https://creativecommons.org/licenses/by-sa/4.0/',
    cc0: 'https://creativecommons.org/publicdomain/zero/1.0/',
    'public-domain': '',
  },
};

/**
 * 책 상세 페이지 카피를 반환한다.
 *
 * phase-11 — 정적 상수를 그대로 반환한다.
 * phase-13b — 본문을 book_detail_copy 테이블 조회로 교체한다(시그니처·반환 타입 불변).
 */
export async function getBookDetailCopy(): Promise<BookDetailCopy> {
  return BOOK_DETAIL_COPY;
}
