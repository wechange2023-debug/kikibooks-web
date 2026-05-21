import type { Book } from '@/lib/book/detail';

/**
 * BookMeta — 책 상세 hero 영역의 메타 칩 (레벨·연령·언어).
 *
 * 디자인 인용 (phase-10 LevelSelector 칩 토큰 재사용 정합):
 *   - design-system §3 Chip — h-[38px] + px-4 + rounded-pill
 *   - design-system §1.8 자녀 레벨 매핑 — bg-level-1~5 정적 swatch dot (phase-10 D11 패턴)
 *   - design-system §6.2 표면 위 표면 — border-outline 1px + bg-surface-2
 *
 * NULL 안전 분기 (2026-05-21 실측 박제):
 *   - level NULL → 레벨 칩 자체 생략 (Book Dash 54권 = 활성 6%)
 *   - age_min/age_max NULL → 연령 칩 자체 생략 (level NULL과 동일 분포)
 *   - language: NOT NULL DEFAULT 'en' — 항상 표시. 활성 책 100% 'en'
 *
 * 책임 분리:
 *   - 본 컴포넌트는 칩 표시만. 메타 가공·조회 0건 (Book이 이미 정규화됨)
 *   - 페이지가 BookCoverHero + BookMeta를 hero 영역으로 묶어 형제 배치 (intent §5.1·§5.2)
 *   - phase-09a/10 GreetingCard·LevelSelector 형제 배치 패턴 정합
 *
 * 언어 매핑 정책:
 *   - 베타 'en' 단일 (ADR-0006). 매핑은 본 컴포넌트 내부 상수로 박제.
 *   - 다국어 도입 시점에 lib/book/copy.ts BookDetailCopy.languageNames로 이동 검토.
 *
 * 인터랙션 0건 — Server Component.
 *
 * D11 (phase-10 cp3_decisions) 정합: 레벨별 클래스 = LEVEL_SWATCH_CLASSES 정적 매핑.
 *   동적 조합(`bg-level-${level}`) 금지 — Tailwind content 스캐너 인식 보장.
 *
 * 의도 문서: docs/intent/screen-03-book-detail.md §5.2
 */

interface BookMetaProps {
  book: Book;
}

/** Level 1~5 swatch 클래스 정적 매핑 (design-system §1.8). phase-10 D11 패턴. */
const LEVEL_SWATCH_CLASSES: Record<number, string> = {
  1: 'bg-level-1',
  2: 'bg-level-2',
  3: 'bg-level-3',
  4: 'bg-level-4',
  5: 'bg-level-5',
};

/** 베타 언어 매핑 (ADR-0006 영어 단일). 다국어 도입 시 copy.ts 이전 검토. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: '영어',
  ko: '한국어',
};

/** 모든 칩에 공통 적용되는 §3 Chip 토큰. */
const CHIP_CLASS =
  'inline-flex h-[38px] items-center rounded-pill border border-outline bg-surface-2 px-4 text-sm font-medium text-text';

/** age_min/age_max → 한국어 라벨. 둘 다 NULL이면 null 반환(호출 측이 칩 생략). */
function formatAgeRange(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min === null) return `~${max}세`;
  if (max === null) return `${min}세~`;
  if (min === max) return `${min}세`;
  return `${min}~${max}세`;
}

export function BookMeta({ book }: BookMetaProps) {
  const swatchClass = book.level !== null ? LEVEL_SWATCH_CLASSES[book.level] : null;
  const ageLabel = formatAgeRange(book.age_min, book.age_max);
  const languageLabel = LANGUAGE_NAMES[book.language] ?? book.language;

  return (
    <ul
      aria-label="책 정보"
      className="flex flex-wrap items-center justify-center gap-2"
    >
      {book.level !== null && swatchClass ? (
        <li className={`${CHIP_CLASS} gap-2`}>
          <span aria-hidden="true" className={`h-3 w-3 rounded-full ${swatchClass}`} />
          Level {book.level}
        </li>
      ) : null}

      {ageLabel ? <li className={CHIP_CLASS}>{ageLabel}</li> : null}

      <li className={CHIP_CLASS}>{languageLabel}</li>
    </ul>
  );
}
