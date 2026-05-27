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
 * 책 뷰어 페이지(Screen 04 `/book/[id]/read`) 카피 단일 출처.
 *
 * BookDetailCopy와 분리한 사유 (CP3-a-1 결정 2 — 단일 책임):
 *   책 상세와 책 뷰어는 서로 다른 화면·다른 카피 집합이다. BookDetailCopy를
 *   확장하지 않고 별도 인터페이스로 둬 각 화면의 카피 변경이 서로를 오염시키지
 *   않게 한다. phase-13b Admin DB 관리 전환 시에도 두 화면의 카피 테이블을
 *   독립적으로 다룰 수 있다.
 *
 * ★ 미니 어트리뷰션 바 카피는 본 인터페이스에 두지 않는다 (CP3-a-1 옵션 β).
 *   reader-attribution-bar는 buildAttributionRows(book, BookDetailCopy)의 결과를
 *   재사용하므로 라이선스('📜 라이선스')·출처('🔗 원본 보기') 라벨이 이미
 *   BookDetailCopy.attribution.rowLabels에 존재한다. 중복 박제를 피한다
 *   (ADR-0012 결정 2 단일 출처 + ADR-0016 Amendment #1 "신규 분기·카피 0건").
 *   read page는 getBookDetailCopy()와 getBookReaderCopy()를 함께 호출한다.
 *
 * ⚠️ CP3-b 진입 시 finish(완독 버튼) + celebrate(축하 placeholder) 섹션을
 *   본 인터페이스에 추가한다 (ADR-0017 D4·D7·d13).
 */
export interface BookReaderCopy {
  /**
   * HtmlReader iframe 로딩·실패 폴백 카피 (ADR-0017 D1 iframe 단일 경로).
   *
   * 외부 호스팅(Book Dash GitHub Pages · GDL digitallibrary.io) 다운·차단 시
   * 백지 화면 대신 폴백 UI를 노출한다 — phase-12 F15(iframe 외부 가용성) 1차 방어.
   * 로딩 0초 스피너 → 5초 타임아웃 또는 onError 시 error* 문구 + 돌아가기 버튼.
   */
  reader: {
    /** iframe onLoad 전 로딩 스피너 보조 문구. */
    loading: string;
    /** 5초 타임아웃·onError 폴백 헤더. */
    errorTitle: string;
    /** 폴백 본문 안내. */
    errorBody: string;
    /** 폴백 시 책 상세(`/book/[id]`)로 복귀하는 버튼 라벨. */
    backToDetailLabel: string;
  };
  /**
   * content_type ≠ 'html' 분기 골격 카피 (ADR-0017 D1·D2).
   *
   * 활성 책 896/896 = 100% 'html'이라 실데이터 0건이나, epub·h5p·pdf 분기 지점에
   * 미구현 안내 + 원본 보기 폴백을 둔다. epub.js·h5p-standalone는 미설치
   * (실데이터 ≥1건 발생 시 도입 트리거, D2).
   */
  unsupportedFormat: {
    /** 미지원 형식 안내 문구. */
    notice: string;
    /** 원본 외부 페이지로 보내는 폴백 링크 라벨. */
    originalLinkLabel: string;
  };
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
 * 책 뷰어 카피 정본. export하지 않는다(BOOK_DETAIL_COPY와 동일 — 컴포넌트 직접
 * import 차단, ADR-0012 결정 2 패턴).
 */
const BOOK_READER_COPY: BookReaderCopy = {
  reader: {
    loading: '책을 펼치는 중이에요…',
    errorTitle: '책을 불러올 수 없어요',
    errorBody: '잠시 후 다시 시도해주세요.',
    backToDetailLabel: '책 상세로 돌아가기',
  },
  unsupportedFormat: {
    notice: '아직 지원하지 않는 형식이에요',
    originalLinkLabel: '원본에서 보기',
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

/**
 * 책 뷰어 페이지 카피를 반환한다.
 *
 * phase-12 — 정적 상수를 그대로 반환한다(getBookDetailCopy와 동일 패턴).
 * phase-13b — 본문을 book_reader_copy 테이블 조회로 교체한다(시그니처·반환 타입 불변).
 */
export async function getBookReaderCopy(): Promise<BookReaderCopy> {
  return BOOK_READER_COPY;
}
