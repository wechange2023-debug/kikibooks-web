import 'server-only';

import type { Book } from './detail';
import type { BookDetailCopy } from './copy';

/**
 * 책 상세 AttributionBox 행 생성 헬퍼 — buildAttributionRows.
 *
 * ADR-0016 결정 1-가 — illustrator IS NULL → '🎨 그림' 행 DOM 생략.
 * ADR-0016 결정 2-나 — source_platform='gdl' → '✍️ 글' 행 생략 + '🏢 출판사' 행 추가.
 *                     source_platform='book_dash' → '✍️ 글' 행 추가 + '🏢 출판사' 행 생략.
 *                     publisher = book.author 컬럼 그대로 (DB 무변경, ADR-0014 Amendment #2 §D
 *                     "GDL books.author는 사실상 publisher" 사실 인용).
 * ADR-0016 결정 3   — 5요소(+ 옵션 publisher) 행 순서: 출처 / (글 XOR 출판사) / 그림 / 라이선스 / 원본.
 *                     H1 제목은 BookCoverHero에서 별도 — 본 함수가 생성하지 않는다
 *                     (H1 + AttributionBox = 통합 어트리뷰션 단위, license-rules.md §5.3).
 *
 * 분기 의사 코드:
 *   1) 출처 행 추가 — 항상.
 *   2) book.author 존재 시:
 *      - source_platform='gdl' → 출판사 행 추가
 *      - 그 외 → 글 행 추가
 *      book.author=NULL이면 글·출판사 행 모두 skip — phase-09a CP2 측정에서 GDL 842권 중
 *      540권(64%)이 author NULL인 적재 현황 반영. license-rules.md §4.2 표준 포맷이
 *      attribution_text 필드에는 별도 박제되어 있으므로 어트리뷰션 의무 자체는 충족.
 *   3) book.illustrator 존재 시 그림 행 추가 (ADR-0016 결정 1-가). 활성 책 100% NULL
 *      현황에서는 항상 skip.
 *   4) 라이선스 행 추가 — 항상. href = copy.licenseUrls[license] (Public Domain은 ''로
 *      박제되어 있어 falsy로 href 미부착).
 *   5) 원본 보기 행 추가 — 항상. href = book.original_url (license-rules.md §7.2 외부
 *      새 탭, 컴포넌트가 target=_blank + rel=noopener noreferrer 부착).
 *
 * key 필드는 CP3-a AttributionBox.tsx가 행별 시각 처리(라이선스 배지·외부 링크 화살표 등)를
 * 분기하기 위한 식별자다.
 *
 * server-only — page.tsx(server component)에서만 호출된다. 인자 객체(book·copy)에 직접
 * 의존하므로 runtime은 순수 함수이나, 일관 패턴 유지 + lib/book/ 모듈 보호.
 *
 * 의도 문서: docs/intent/screen-03-book-detail.md §5.3
 */

/** AttributionBox 한 행. 외부 링크는 href 존재로 식별. */
export interface AttributionRow {
  /**
   * 행 식별자. CP3-a AttributionBox.tsx가 행별 시각 처리(라이선스 배지·외부 링크 화살표
   * ·icon 등)를 분기하는 키. React list key로도 안정적(같은 책에서 중복 없음 보장).
   */
  key: 'source' | 'author' | 'illustrator' | 'publisher' | 'license' | 'originalLink';
  /** "📚 출처" 등 사용자 표시 라벨 (copy.attribution.rowLabels에서 매핑). */
  label: string;
  /** 사용자 표시 값 ("Book Dash"·"Sandiso Ngcobo"·"CC BY 4.0" 등). */
  value: string;
  /**
   * 외부 링크 URL. license·originalLink 행만 보유 가능. Public Domain의 licenseUrl=''는
   * undefined로 정규화되어 href 미부착(컴포넌트는 텍스트 표시).
   * 컴포넌트는 href 존재 시 target=_blank + rel=noopener noreferrer 부착 의무
   * (license-rules.md §7.2).
   */
  href?: string;
}

/**
 * Book + 카피로 AttributionBox 행 배열을 생성한다.
 *
 * @param book 책 상세 데이터 (lib/book/detail.ts getBookById 반환).
 * @param copy 카피 단일 출처 (lib/book/copy.ts getBookDetailCopy 반환).
 * @returns 표시할 AttributionRow 배열 (3~5행). 컴포넌트는 배열 순서대로 렌더한다.
 */
export function buildAttributionRows(book: Book, copy: BookDetailCopy): AttributionRow[] {
  const { rowLabels } = copy.attribution;
  const rows: AttributionRow[] = [];

  // 1. 출처 — 항상 표시
  rows.push({
    key: 'source',
    label: rowLabels.source,
    value: copy.sourcePlatformNames[book.source_platform] ?? book.source_platform,
  });

  // 2. 글 XOR 출판사 — source_platform 분기 (ADR-0016 결정 2-나)
  //    publisher = book.author 컬럼 그대로 (ADR-0014 Amendment #2 §D)
  if (book.author) {
    if (book.source_platform === 'gdl') {
      rows.push({
        key: 'publisher',
        label: rowLabels.publisher,
        value: book.author,
      });
    } else {
      rows.push({
        key: 'author',
        label: rowLabels.author,
        value: book.author,
      });
    }
  }

  // 3. 그림 — illustrator NULL 시 행 생략 (ADR-0016 결정 1-가)
  if (book.illustrator) {
    rows.push({
      key: 'illustrator',
      label: rowLabels.illustrator,
      value: book.illustrator,
    });
  }

  // 4. 라이선스 — 항상 표시. license-rules.md §4.1 화이트리스트 4종 보장(books CHECK 제약)
  const licenseUrl = copy.licenseUrls[book.license];
  rows.push({
    key: 'license',
    label: rowLabels.license,
    value: copy.licenseNames[book.license] ?? book.license,
    href: licenseUrl || undefined,
  });

  // 5. 원본 보기 — 항상 표시 (books.original_url NOT NULL 보장)
  rows.push({
    key: 'originalLink',
    label: rowLabels.originalLink,
    value: book.original_url,
    href: book.original_url,
  });

  return rows;
}
