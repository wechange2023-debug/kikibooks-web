'use client';

import type {
  ReviewBookDetail,
  ReviewStatus,
} from '@/lib/admin/review/query';

/**
 * ReviewDetailView — 책별 검수 상세 표시 (ADR-0051 구현 1, 읽기 전용).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용
 * ──────────────────────────────────────────────────────────────────────────────
 *   - ADR-0051 D1: 페이지를 세로로 나열, 각 행 2단 = [좌: 이미지 NN.jpg | 우: text].
 *   - ADR-0051 D2: 편집 대상은 book_text.text 뿐이나, 본 구현 1은 표시 전용이다 —
 *     편집 input·저장 버튼 0건(구현 2에서 in_review 상태에 한해 개방).
 *   - ADR-0051 D3: status는 표시만. 전이 버튼(검수시작·확정·되돌리기)은 구현 2 범위.
 *   - ADR-0051 D4: 회전 페이지 "⚠ 회전 의심" 배지는 구현 1 범위 밖(rotation_audit CSV
 *     적재 경로 미정). 이미지 자동교정은 어느 구현에서도 하지 않는다(ADR-0050 D1·D2).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 이미지 URL 조립 규칙 (Storage 접근 0건 — 문자열 조립만)
 * ──────────────────────────────────────────────────────────────────────────────
 *   {NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/book-images/book_dash-{slug}/{NN}.jpg
 *     - slug   = books.source_id (books에 slug 컬럼 없음.
 *                scripts/pdf_harvest/upload_page_images.py:9-10 "source_id = slug 코호트")
 *     - NN     = pageIndex + 1, 2자리 zero-pad (ADR-0046 D2: page_index는 0-based)
 *     - 버킷은 public이라 anon 조회 대상 — secret 키 불요·불사용(Hard Rule 6).
 *   규칙 조립은 존재 확인 없이 무조건 URL을 만든다. 객체가 없으면 404 → 해당 칸만 비운다.
 *
 * 'use client' 채택 사유:
 *   표시 자체는 서버 렌더로도 가능하나, 구현 2에서 편집 input·저장·상태 전이가 본 컴포넌트에
 *   붙는다(ADR-0051 D2·D3). 경계를 지금 확정해 구현 2의 변경 표면을 줄인다.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 폭 확장 (구현 1-b)
 * ──────────────────────────────────────────────────────────────────────────────
 *   원본 이미지 속 글씨가 작아 검수가 어렵다는 팀장 검증 결과 반영. 폭·비율만 조정하고
 *   로직·조회는 불변.
 *     - app/admin/layout.tsx:72가 children을 `mx-auto ... lg:max-w-screen-lg`(1024px)로
 *       가둔다. layout은 다른 admin 화면 공통 래퍼라 불가침 → 본 컴포넌트 안에서
 *       breakout 래퍼(`relative left-1/2 w-[96vw] -translate-x-1/2`)로 그 제약을 벗어난다.
 *       영향 범위는 /admin/review/[bookId] 1개 화면뿐이다.
 *     - w-screen(100vw) 대신 96vw를 쓰는 이유: 100vw는 세로 스크롤바 폭을 포함해 가로
 *       스크롤바를 유발한다. 96vw면 양옆 여백이 남아 그 현상이 없다.
 *     - 2단 비율 = 이미지 3fr : 텍스트 2fr (= 60:40, ADR-0051 D1 좌우 2단 유지).
 *       반응형 붕괴 미고려 — 팀장 전용 데스크탑 검수 도구.
 *
 * 토큰 재사용 (Hard Rule 10):
 *   font-display·text-text·text-text-variant·bg-surface·bg-surface-2·border-outline만 사용.
 *   신규 토큰·raw HEX 0건.
 *
 * ADR: docs/adr/0051-admin-review-screen.md D1·D2·D3
 * 패턴 정합: components/book/asb-reader.tsx (평문 img — 최적화 불요 원격 이미지)
 */

/** status 신호등 — ADR-0051 D3 박제. app/admin/review/page.tsx와 동일 매핑. */
const STATUS_SIGNAL: Record<ReviewStatus, { lamp: string; label: string }> = {
  draft: { lamp: '🔴', label: '초안' },
  in_review: { lamp: '🟡', label: '검수중' },
  confirmed: { lamp: '🟢', label: '확정' },
  tts_done: { lamp: '🔵', label: '음성완료' },
};

/** Storage 공개 URL 조립. env 누락 시 빈 문자열 → img가 로드 실패로 자기 칸만 비운다. */
function buildPageImageUrl(slug: string, pageIndex: number): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    return '';
  }
  const nn = String(pageIndex + 1).padStart(2, '0');
  return `${base}/storage/v1/object/public/book-images/book_dash-${slug}/${nn}.jpg`;
}

export function ReviewDetailView({ detail }: { detail: ReviewBookDetail }) {
  const signal = STATUS_SIGNAL[detail.status];

  return (
    <div className="relative left-1/2 flex w-[96vw] -translate-x-1/2 flex-col gap-4 px-4 md:gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-text md:text-3xl">
          {detail.title}
        </h1>
        <p className="flex items-center gap-2 text-sm text-text-variant">
          <span aria-hidden="true">{signal.lamp}</span>
          <span>{signal.label}</span>
          <span aria-hidden="true">·</span>
          <span>{detail.slug}</span>
          <span aria-hidden="true">·</span>
          <span>{detail.pages.length}면</span>
        </p>
      </header>

      {detail.pages.length === 0 ? (
        <p className="rounded-lg border border-outline bg-surface p-4 text-sm text-text-variant">
          적재된 페이지 텍스트가 없습니다.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {detail.pages.map((page) => (
            <li
              key={page.pageIndex}
              className="grid grid-cols-[3fr_2fr] gap-4 rounded-lg border border-outline bg-surface p-4"
            >
              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-variant">
                  {String(page.pageIndex + 1).padStart(2, '0')}면
                </span>
                {/* 자체 창고(Supabase Storage public) 이미지 — 규칙 조립 URL이라 next/image
                    최적화 불요. asb-reader.tsx PageImage 선례 정합. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={buildPageImageUrl(detail.slug, page.pageIndex)}
                  alt={`${detail.title} ${page.pageIndex + 1}면`}
                  className="h-auto w-full rounded-md bg-surface-2 object-contain"
                />
              </div>

              <div>
                {/* 구현 1은 표시 전용 — 편집 input 0건(ADR-0051 D2, 구현 2에서 개방). */}
                <pre className="whitespace-pre-wrap break-words rounded-md bg-surface-2 p-3 font-sans text-sm leading-relaxed text-text">
                  {page.text}
                </pre>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
