import type { AttributionRow } from '@/lib/book/attribution';

/**
 * ReaderAttributionBar — 책 뷰어(`/book/[id]/read`) 상단 미니 어트리뷰션 바.
 *
 * 베타 법적 의무 (ADR-0016 Amendment #1) — URL 직접 진입으로 책 상세를 우회해도
 * iframe 직상단 1줄 바로 CC BY 4.0 의무 표시를 유지한다(어트리뷰션 누락 0건).
 *
 * 책임 분리 — AttributionBox와 동일하게 분기 로직 0건 보유한다. buildAttributionRows가
 * 만든 AttributionRow 배열을 받아, 미니 바에 표시할 행만 선별·압축해 1줄로 렌더한다.
 * source_platform 분기(Book Dash author / GDL publisher)는 lib/book/attribution.ts
 * buildAttributionRows가 모두 처리하므로 본 컴포넌트에 신규 분기·신규 카피는 없다
 * (ADR-0012 결정 2 단일 출처 + ADR-0016 Amendment #1 "신규 분기·카피 0건").
 *
 * 압축 선별 (ADR-0016 Amendment #1):
 *   - 표시: author XOR publisher · license · originalLink (3행 → 1줄)
 *   - 제외: source(📚 출처) — 미니 바 공간 제약, 출처 링크(🔗)가 출처 역할 대행
 *   - 제외: illustrator(🎨 그림) — 활성 책 896/896 = 100% NULL(ADR-0016 결정 1 +
 *           ADR-0014 Amendment #2 §C)이라 실질 행 0건. 미니 바 공간 제약과도 정합.
 *   책 제목은 본 바가 아니라 뷰어 페이지 헤더(CP3-a-5)에 노출해 '제목 + 어트리뷰션 =
 *   통합 어트리뷰션 단위'(ADR-0016 결정 3)를 충족한다.
 *
 * 디자인 인용 (design-system §7.1 AttributionBox 토큰 패밀리 재사용):
 *   - 미니 바 전용 토큰은 §7.2에 별도 박제가 없어 AttributionBox(§7.1)와 동일 토큰을
 *     쓴다 — bg-surface-2 + border-outline 하단 구분선. iframe 컨테이너(§7.2 html 행
 *     --color-surface-3)와 표면 단계가 1칸 달라 시각적으로 분리된다.
 *   - 라벨: text-xs + font-semibold + text-text / 값: text-xs + text-text-variant
 *   - 라이선스 배지: rounded-pill + bg-tertiary-container + text-on-tertiary-container
 *   - 외부 링크: text-tertiary + hover underline
 *   - 여백: 모바일 px-4 / 태블릿+ px-6 (§7.2 뷰어 좌우 여백 16/32px 정합)
 *
 * 외부 링크 안전 속성 (license-rules.md §7.2) — AttributionBox와 동일:
 *   href 존재 행(license·originalLink) → target="_blank" + rel="noopener noreferrer".
 *
 * 반응형 — flex-wrap으로 모바일(390px)에서 자연 줄바꿈, 태블릿+에서 1줄 유지.
 *
 * Server Component — AttributionBox와 동일하게 정적 렌더, 핸들러·상태 0건.
 * server-only import 없음(presentational 컴포넌트, 타입만 import).
 *
 * 의도 문서: docs/intent/screen-04-reader.md §5.2
 */

interface ReaderAttributionBarProps {
  rows: AttributionRow[];
}

/** 미니 바에 표시할 행 key (source·illustrator 제외). */
const BAR_KEYS: ReadonlySet<AttributionRow['key']> = new Set([
  'author',
  'publisher',
  'license',
  'originalLink',
]);

export function ReaderAttributionBar({ rows }: ReaderAttributionBarProps) {
  const barRows = rows.filter((row) => BAR_KEYS.has(row.key));

  return (
    <section
      aria-label="저작권 정보"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-outline bg-surface-2 px-4 py-2 text-xs md:px-6"
    >
      {barRows.map((row) => {
        if (row.key === 'originalLink') {
          return (
            <a
              key={row.key}
              href={row.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-tertiary transition-colors duration-200 ease-kiki hover:underline"
            >
              {row.label}
            </a>
          );
        }

        if (row.key === 'license') {
          return row.href ? (
            <a
              key={row.key}
              href={row.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-pill bg-tertiary-container px-3 py-1 font-medium text-on-tertiary-container transition-colors duration-200 ease-kiki hover:underline"
            >
              {row.value}
            </a>
          ) : (
            <span
              key={row.key}
              className="inline-flex items-center rounded-pill bg-tertiary-container px-3 py-1 font-medium text-on-tertiary-container"
            >
              {row.value}
            </span>
          );
        }

        // author XOR publisher — 라벨(✍️ 글 / 🏢 출판사) + 값(저작자/출판사명)
        return (
          <span key={row.key} className="inline-flex items-baseline gap-1">
            <span className="font-semibold text-text">{row.label}</span>
            <span className="break-keep text-text-variant">{row.value}</span>
          </span>
        );
      })}
    </section>
  );
}
