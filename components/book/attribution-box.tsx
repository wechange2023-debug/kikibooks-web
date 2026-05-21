import type { AttributionRow } from '@/lib/book/attribution';

/**
 * AttributionBox — 책 상세 페이지 CC BY 4.0 어트리뷰션 행 표시 컴포넌트.
 *
 * 베타 법적 의무 (license-rules.md §5) — 모든 책 상세 페이지 100% 표시. rows prop이
 * required 타입이므로 누락 시 TypeScript 컴파일 에러 발생 (§5.2 "필수 prop" 정합).
 *
 * 책임 분리 — 본 컴포넌트는 분기 로직 0건 보유한다. AttributionRow 배열을 받아
 * 순서대로 렌더할 뿐이다. illustrator NULL·GDL publisher 분기는 lib/book/attribution.ts
 * buildAttributionRows가 모두 처리한다(ADR-0016 결정 1·2 의사 코드 박제).
 *
 * 디자인 인용 (design-system §7.1):
 *   - Container: bg-surface-2 + border-outline 1px + rounded-md + py-4 px-5
 *   - 라벨: text-sm + font-semibold + text-text
 *   - 값: text-xs + text-text-variant
 *   - 외부 링크: text-sm + text-tertiary + hover underline
 *   - 라이선스 배지: rounded-pill + bg-tertiary-container + text-on-tertiary-container
 *
 * 위치 규칙 (license-rules.md §5.3): 책 표지 직하단·읽기 버튼 직상단·모바일 fold above.
 * 본 컴포넌트는 위치 강제를 자체적으로 하지 않는다 — 페이지(app/book/[id]/page.tsx)가
 * 배치 책임. v12 검증 항목.
 *
 * 외부 링크 안전 속성 (license-rules.md §7.2):
 *   - href 존재 행(license·originalLink) → target="_blank" + rel="noopener noreferrer"
 *     자동 부착. 호출 측은 href만 박제하면 충분(속성 누락 방지).
 *
 * key별 시각 분기:
 *   - 'license'      → 값이 라이선스 배지(rounded-pill chip). href 있으면 클릭 가능
 *   - 'originalLink' → 라벨 자체가 링크 (row.value=URL은 의도적으로 미표시 — URL은
 *                      길이가 가변적이라 모바일 fold above 위협. license-rules.md §5.1
 *                      "🔗 원본 보기" 박제와 정합)
 *   - 그 외          → 일반 라벨 + 값 (dt + dd)
 *
 * 시맨틱: dl/dt/dd — 라벨-값 쌍 구조에 정합. 스크린리더 접근성 우수.
 *
 * Server Component — 정적 렌더, 핸들러 없음.
 *
 * 의도 문서: docs/intent/screen-03-book-detail.md §5.3
 */

interface AttributionBoxProps {
  rows: AttributionRow[];
}

export function AttributionBox({ rows }: AttributionBoxProps) {
  return (
    <section
      aria-label="저작권 정보"
      className="rounded-md border border-outline bg-surface-2 px-5 py-4"
    >
      <dl className="flex flex-col gap-2">
        {rows.map((row) => {
          if (row.key === 'originalLink') {
            return (
              <div key={row.key} className="flex">
                <a
                  href={row.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-tertiary transition-colors duration-200 ease-kiki hover:underline"
                >
                  {row.label}
                </a>
              </div>
            );
          }

          if (row.key === 'license') {
            return (
              <div
                key={row.key}
                className="flex flex-wrap items-center gap-2"
              >
                <dt className="text-sm font-semibold text-text">{row.label}</dt>
                <dd>
                  {row.href ? (
                    <a
                      href={row.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-pill bg-tertiary-container px-3 py-1 text-xs font-medium text-on-tertiary-container transition-colors duration-200 ease-kiki hover:underline"
                    >
                      {row.value}
                    </a>
                  ) : (
                    <span className="inline-flex items-center rounded-pill bg-tertiary-container px-3 py-1 text-xs font-medium text-on-tertiary-container">
                      {row.value}
                    </span>
                  )}
                </dd>
              </div>
            );
          }

          return (
            <div key={row.key} className="flex flex-wrap items-baseline gap-2">
              <dt className="shrink-0 text-sm font-semibold text-text">
                {row.label}
              </dt>
              <dd className="break-keep text-xs text-text-variant">{row.value}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
