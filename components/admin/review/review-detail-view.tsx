'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  saveReviewText,
  transitionReviewStatus,
} from '@/lib/admin/review/actions';
import type {
  ReviewBookDetail,
  ReviewStatus,
} from '@/lib/admin/review/query';
import { isRotatedPage } from '@/lib/admin/review/rotation-pages';

/**
 * ReviewDetailView — 책별 검수 상세 (ADR-0051 구현 1 표시 + 구현 2 편집·전이).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 박제 인용
 * ──────────────────────────────────────────────────────────────────────────────
 *   - ADR-0051 D1: 페이지를 세로로 나열, 각 행 2단 = [좌: 이미지 NN.jpg | 우: text].
 *   - ADR-0051 D2: 편집 대상은 book_text.text 뿐. blocks 편집 0건(2차 백로그).
 *   - ADR-0051 D3: status가 'in_review'일 때만 textarea·[저장] 활성. 그 외는 읽기 전용.
 *     전이 버튼은 상태별 1종(검수시작·확정·되돌리기). tts_done 되돌리기는 window.confirm
 *     경고 후에만 호출한다(경고 문구 박제 직역).
 *   - ADR-0051 D4: 회전 의심 면(직교회전 33면/18권)에 "⚠ 회전 의심" 배지를 **표시만** 한다.
 *     출처는 lib/admin/review/rotation-pages.ts 상수. 이미지 자동교정·텍스트 자동교정은
 *     하지 않는다(ADR-0050 D1·D2 — 검수자는 원본과 동일한 화면을 봐야 한다).
 *   - ADR-0019 D18: server action 결과를 useTransition으로 받아 메시지를 표시한다.
 *     라이브러리 추가 0건 — React 상태만 사용.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 이미지 URL 조립 규칙 (Storage 접근 0건 — 문자열 조립만)
 * ──────────────────────────────────────────────────────────────────────────────
 *   {NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/book-images/book_dash-{slug}/{NN}.jpg
 *     - slug   = books.source_id (books에 slug 컬럼 없음.
 *                scripts/pdf_harvest/upload_page_images.py:9-10 "source_id = slug 코호트")
 *     - NN     = pageIndex + 1, 2자리 zero-pad (ADR-0046 D2: page_index는 0-based)
 *     - 버킷은 public이라 anon 조회 대상 — secret 키 불요·불사용(Hard Rule 6).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 클라이언트 잠금은 UX일 뿐이다
 * ──────────────────────────────────────────────────────────────────────────────
 *   본 컴포넌트의 편집칸 잠금·버튼 노출 규칙은 편의이며 보안 경계가 아니다. 실제 판정은
 *   lib/admin/review/actions.ts가 DB의 현재 status를 다시 읽어 수행한다(ADR-0051 D3·D5).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 상태 관리 (라이브러리 0건)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - drafts: pageIndex → 편집 중 텍스트
 *   - baselines: pageIndex → 마지막으로 저장된 텍스트(dirty 판정 기준). 저장 성공 시 갱신.
 *   - rowState: pageIndex → 행 단위 저장 결과 표시('saving' | 'saved' | 에러 문구)
 *   전이 성공 후 router.refresh()로 서버에서 새 status를 다시 받는다. drafts는 유지되므로
 *   [검수시작] 직후에도 사용자가 보던 내용이 사라지지 않는다.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 폭 확장 (구현 1-b)
 * ──────────────────────────────────────────────────────────────────────────────
 *   app/admin/layout.tsx:72가 children을 lg:max-w-screen-lg(1024px)로 가둔다. layout은
 *   다른 admin 화면 공통 래퍼라 불가침 → 본 컴포넌트 안에서 breakout 래퍼
 *   (relative left-1/2 w-[96vw] -translate-x-1/2)로 벗어난다. 100vw 대신 96vw인 이유는
 *   100vw가 세로 스크롤바 폭을 포함해 가로 스크롤바를 유발하기 때문이다.
 *   2단 비율 = 이미지 3fr : 텍스트 2fr(60:40). 반응형 붕괴 미고려 — 데스크탑 검수 도구.
 *
 * 토큰 재사용 (Hard Rule 10):
 *   font-display·text-text·text-text-variant·bg-surface·bg-surface-2·border-outline·
 *   primary 계열만 사용. 신규 토큰·raw HEX 0건.
 *
 * ADR: docs/adr/0051-admin-review-screen.md D1·D2·D3·D5
 * 패턴 정합: components/admin/books/admin-books-browser.tsx (useTransition + server action 결과 표시)
 */

/** status 신호등 — ADR-0051 D3 박제. app/admin/review/page.tsx와 동일 매핑. */
const STATUS_SIGNAL: Record<ReviewStatus, { lamp: string; label: string }> = {
  draft: { lamp: '🔴', label: '초안' },
  in_review: { lamp: '🟡', label: '검수중' },
  confirmed: { lamp: '🟢', label: '확정' },
  tts_done: { lamp: '🔵', label: '음성완료' },
};

/** tts_done 되돌리기 경고 — ADR-0051 D3 박제 직역. */
const TTS_REVERT_CONFIRM =
  '이 책은 음성이 이미 생성됐습니다. 텍스트를 다시 고치면 음성을 새로 만들어야 합니다. 계속할까요?';

/** 미저장 수정이 있는 상태에서 [확정] 클릭 시 1회 경고. */
const DIRTY_CONFIRM_CONFIRM =
  '저장하지 않은 수정이 있습니다. 그래도 확정할까요?';

/** Storage 공개 URL 조립. env 누락 시 빈 문자열 → img가 로드 실패로 자기 칸만 비운다. */
function buildPageImageUrl(slug: string, pageIndex: number): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    return '';
  }
  const nn = String(pageIndex + 1).padStart(2, '0');
  return `${base}/storage/v1/object/public/book-images/book_dash-${slug}/${nn}.jpg`;
}

/** 행 단위 저장 표시 상태. */
type RowState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

/** pageIndex → 텍스트 초기 맵. */
function toTextMap(pages: ReviewBookDetail['pages']): Record<number, string> {
  const map: Record<number, string> = {};
  for (const page of pages) {
    map[page.pageIndex] = page.text;
  }
  return map;
}

export function ReviewDetailView({ detail }: { detail: ReviewBookDetail }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    toTextMap(detail.pages),
  );
  const [baselines, setBaselines] = useState<Record<number, string>>(() =>
    toTextMap(detail.pages),
  );
  const [rowStates, setRowStates] = useState<Record<number, RowState>>({});
  const [statusError, setStatusError] = useState<string | null>(null);

  const signal = STATUS_SIGNAL[detail.status];
  const editable = detail.status === 'in_review';

  /** 저장되지 않은 수정이 하나라도 있는가. */
  const dirty = detail.pages.some(
    (page) => (drafts[page.pageIndex] ?? '') !== (baselines[page.pageIndex] ?? ''),
  );

  function setRowState(pageIndex: number, state: RowState): void {
    setRowStates((prev) => ({ ...prev, [pageIndex]: state }));
  }

  function handleSave(pageIndex: number): void {
    const text = drafts[pageIndex] ?? '';
    setRowState(pageIndex, { kind: 'saving' });

    startTransition(async () => {
      const result = await saveReviewText({
        bookId: detail.bookId,
        pageIndex,
        text,
      });

      if (!result.ok) {
        setRowState(pageIndex, { kind: 'error', message: result.error });
        return;
      }

      // 저장 성공 — dirty 판정 기준을 방금 저장한 값으로 옮긴다.
      setBaselines((prev) => ({ ...prev, [pageIndex]: text }));
      setRowState(pageIndex, { kind: 'saved' });
    });
  }

  function handleTransition(to: 'in_review' | 'confirmed'): void {
    // 확정 직전 미저장 경고 (1회)
    if (to === 'confirmed' && dirty && !window.confirm(DIRTY_CONFIRM_CONFIRM)) {
      return;
    }
    // tts_done 되돌리기 경고 (ADR-0051 D3 박제)
    if (
      detail.status === 'tts_done' &&
      to === 'in_review' &&
      !window.confirm(TTS_REVERT_CONFIRM)
    ) {
      return;
    }

    setStatusError(null);
    startTransition(async () => {
      const result = await transitionReviewStatus({
        bookId: detail.bookId,
        to,
      });

      if (!result.ok) {
        setStatusError(result.error);
        return;
      }

      // 서버에서 새 status를 다시 받는다(drafts는 유지 — 편집 중 내용 보존).
      router.refresh();
    });
  }

  /** 현재 status에서 노출할 전이 버튼 1종. tts_done 설정 버튼은 없다(D3). */
  const transitionButton: { label: string; to: 'in_review' | 'confirmed' } | null =
    detail.status === 'draft'
      ? { label: '검수시작', to: 'in_review' }
      : detail.status === 'in_review'
        ? { label: '확정', to: 'confirmed' }
        : { label: '되돌리기', to: 'in_review' };

  return (
    <div className="relative left-1/2 flex w-[96vw] -translate-x-1/2 flex-col gap-4 px-4 md:gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold text-text md:text-3xl">
          {detail.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-text-variant">
          <span aria-hidden="true">{signal.lamp}</span>
          <span>{signal.label}</span>
          <span aria-hidden="true">·</span>
          <span>{detail.slug}</span>
          <span aria-hidden="true">·</span>
          <span>{detail.pages.length}면</span>
          {dirty && (
            <span className="text-primary">· 저장하지 않은 수정 있음</span>
          )}

          {transitionButton && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleTransition(transitionButton.to)}
              className="ml-2 inline-flex items-center rounded-md border border-outline bg-surface px-3 py-1 text-xs font-medium text-text transition-colors hover:bg-surface-2 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
            >
              {transitionButton.label}
            </button>
          )}
        </div>

        {statusError && (
          <p role="alert" className="text-sm text-primary">
            {statusError}
          </p>
        )}
      </header>

      {detail.pages.length === 0 ? (
        <p className="rounded-lg border border-outline bg-surface p-4 text-sm text-text-variant">
          적재된 페이지 텍스트가 없습니다.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {detail.pages.map((page) => {
            const rowState = rowStates[page.pageIndex] ?? { kind: 'idle' };
            const value = drafts[page.pageIndex] ?? '';
            const rowDirty = value !== (baselines[page.pageIndex] ?? '');
            // ADR-0051 D4 — 표시 전용. 이 값은 이미지·텍스트를 바꾸지 않는다.
            const rotated = isRotatedPage(detail.slug, page.pageIndex);

            return (
              <li
                key={page.pageIndex}
                className="grid grid-cols-[3fr_2fr] gap-4 rounded-lg border border-outline bg-surface p-4"
              >
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-2 text-xs text-text-variant">
                    <span>{String(page.pageIndex + 1).padStart(2, '0')}면</span>
                    {rotated && (
                      <span
                        title="원본이 90° 회전 인쇄된 면입니다. 읽기순서가 뒤집혔을 수 있으니 확인해 주세요."
                        className="inline-flex items-center rounded border border-outline bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-text"
                      >
                        ⚠ 회전 의심
                      </span>
                    )}
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

                <div className="flex flex-col gap-2">
                  {editable ? (
                    <>
                      {/* ADR-0051 D3 — in_review 상태에서만 편집칸이 열린다. */}
                      <textarea
                        value={value}
                        rows={10}
                        onChange={(event) => {
                          const next = event.target.value;
                          setDrafts((prev) => ({
                            ...prev,
                            [page.pageIndex]: next,
                          }));
                          // 편집을 시작하면 이전 저장 결과 표시를 지운다.
                          setRowState(page.pageIndex, { kind: 'idle' });
                        }}
                        className="w-full rounded-md border border-outline bg-surface-2 p-3 font-sans text-sm leading-relaxed text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isPending || rowState.kind === 'saving'}
                          onClick={() => handleSave(page.pageIndex)}
                          className="inline-flex items-center rounded-md border border-outline bg-surface px-3 py-1 text-xs font-medium text-text transition-colors hover:bg-surface-2 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
                        >
                          저장
                        </button>
                        {rowState.kind === 'saving' && (
                          <span className="text-xs text-text-variant">
                            저장 중…
                          </span>
                        )}
                        {rowState.kind === 'saved' && (
                          <span className="text-xs text-text-variant">
                            저장됨
                          </span>
                        )}
                        {rowState.kind === 'error' && (
                          <span role="alert" className="text-xs text-primary">
                            {rowState.message}
                          </span>
                        )}
                        {rowState.kind === 'idle' && rowDirty && (
                          <span className="text-xs text-primary">
                            수정됨 · 저장 필요
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    /* in_review가 아니면 편집칸 잠금 — 읽기 전용 표시(ADR-0051 D3). */
                    <pre className="whitespace-pre-wrap break-words rounded-md bg-surface-2 p-3 font-sans text-sm leading-relaxed text-text">
                      {page.text}
                    </pre>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
