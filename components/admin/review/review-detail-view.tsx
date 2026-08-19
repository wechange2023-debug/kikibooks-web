'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  saveReviewText,
  transitionReviewStatus,
  type ReviewTransitionTarget,
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
 * 이미지 출처 = book_text.image_url (조립 0건 — ADR-0057 D2)
 * ──────────────────────────────────────────────────────────────────────────────
 *   DB에 저장된 완성된 절대 URL을 그대로 <img src>에 쓴다. 종전의 문자열 조립
 *   (`book-images/book_dash-{slug}/{NN}.jpg`)과 그 조립 함수 buildPageImageUrl은 폐기됐다.
 *   폐기 사유: 접두사 book_dash- 가 하드코딩이라 타 플랫폼에서 조용히 404가 났고,
 *   ASb·Bloom 본문 이미지는 애초에 이 버킷에 객체가 없다(외부 CDN 소재).
 *
 *   오디오 리더(lib/book/audio-manifest.ts)와 **같은 컬럼**을 읽는다 —
 *   두 화면의 출처 동일성 불변식(ADR-0052 D4)이 이제 DB 컬럼 하나로 보장된다(ADR-0057 D4).
 *   imageUrl이 null인 면은 "이미지 없음" 표기를 렌더한다(ADR-0057 D3 — 빈 칸 금지).
 *   버킷·CDN 모두 공개 읽기 — secret 키 불요·불사용(Hard Rule 6).
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

/**
 * status 신호등 — ADR-0051 D3 + ADR-0058 D2(tts_requested) 박제.
 * review-list-view.tsx와 동일 매핑(두 곳 모두 Record<ReviewStatus, …>라 값이 늘면
 * 양쪽 다 컴파일 에러로 드러난다 — 조용한 불일치가 생기지 않는다).
 */
const STATUS_SIGNAL: Record<ReviewStatus, { lamp: string; label: string }> = {
  draft: { lamp: '🔴', label: '초안' },
  in_review: { lamp: '🟡', label: '검수중' },
  confirmed: { lamp: '🟢', label: '확정' },
  tts_requested: { lamp: '🟣', label: '음성요청됨' },
  tts_done: { lamp: '🔵', label: '음성완료' },
};

/** tts_done 되돌리기 경고 — ADR-0051 D3 박제 직역. */
const TTS_REVERT_CONFIRM =
  '이 책은 음성이 이미 생성됐습니다. 텍스트를 다시 고치면 음성을 새로 만들어야 합니다. 계속할까요?';

/**
 * TTS 생성 요청 확인 — 요청은 곧 배치 합성 대상 등록이라 되돌리기 창이 좁다(ADR-0058 O2).
 */
const TTS_REQUEST_CONFIRM =
  '이 책을 TTS 생성 요청 목록에 올립니다. 요청 후에는 텍스트를 고칠 수 없고, 음성이 만들어진 뒤에는 재생성이 지원되지 않습니다. 계속할까요?';

/**
 * 요청 철회 경고 — ADR-0058 O2(배치 착수 후 철회는 반영되지 않을 수 있음) 박제.
 */
const TTS_CANCEL_CONFIRM =
  '음성 생성 요청을 철회하고 검수중으로 되돌립니다. 이미 생성 배치가 시작됐다면 철회가 반영되지 않을 수 있습니다. 계속할까요?';

/** 오디오 보유로 요청 버튼이 잠겼을 때의 사유 표기 — ADR-0058 D4. */
const AUDIO_LOCK_REASON = '오디오 보유 — 재생성은 별도 트랙';

/** 미저장 수정이 있는 상태에서 [확정] 클릭 시 1회 경고. */
const DIRTY_CONFIRM_CONFIRM =
  '저장하지 않은 수정이 있습니다. 그래도 확정할까요?';

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

  function handleTransition(to: ReviewTransitionTarget): void {
    // 확정 직전 미저장 경고 (1회)
    if (to === 'confirmed' && dirty && !window.confirm(DIRTY_CONFIRM_CONFIRM)) {
      return;
    }
    // TTS 생성 요청 확인 (ADR-0058 D3)
    if (to === 'tts_requested' && !window.confirm(TTS_REQUEST_CONFIRM)) {
      return;
    }
    // 요청 철회 경고 (ADR-0058 O2)
    if (
      detail.status === 'tts_requested' &&
      to === 'in_review' &&
      !window.confirm(TTS_CANCEL_CONFIRM)
    ) {
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

  /**
   * 현재 status에서 노출할 검수 전이 버튼 1종. tts_done 설정 버튼은 없다(ADR-0051 D3).
   * tts_requested에서의 '되돌리기'는 요청 철회이므로 라벨을 구분한다(ADR-0058 D3).
   */
  const transitionButton: { label: string; to: ReviewTransitionTarget } =
    detail.status === 'draft'
      ? { label: '검수시작', to: 'in_review' }
      : detail.status === 'in_review'
        ? { label: '확정', to: 'confirmed' }
        : detail.status === 'tts_requested'
          ? { label: '요청 철회', to: 'in_review' }
          : { label: '되돌리기', to: 'in_review' };

  /**
   * TTS 생성 요청 버튼의 노출·활성 조건 (ADR-0058 D3·D4).
   *
   *   노출: status ∈ {draft, confirmed} — 전이표에 진입 행이 있는 두 상태뿐이다.
   *         in_review는 편집 중이라 금지, tts_requested·tts_done은 이미 지난 단계다.
   *   활성: book_audio 0행. 보유 시 잠그고 사유를 표시한다(재생성 차단).
   *
   * 이 잠금은 UX일 뿐이며 실제 거부는 actions.ts가 DB를 다시 읽어 수행한다.
   */
  const canRequestTts =
    detail.status === 'draft' || detail.status === 'confirmed';

  return (
    <div className="relative left-1/2 flex w-[96vw] -translate-x-1/2 flex-col gap-4 px-4 md:gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-h1 font-bold text-text">
          {detail.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-label text-text-variant">
          <span aria-hidden="true">{signal.lamp}</span>
          <span>{signal.label}</span>
          <span aria-hidden="true">·</span>
          <span>{detail.slug}</span>
          <span aria-hidden="true">·</span>
          <span>{detail.pages.length}면</span>
          {dirty && (
            <span className="text-primary">· 저장하지 않은 수정 있음</span>
          )}

          <button
            type="button"
            disabled={isPending}
            onClick={() => handleTransition(transitionButton.to)}
            className="ml-2 inline-flex items-center rounded-md border border-outline bg-surface px-3 py-1 text-caption font-medium text-text transition-colors hover:bg-surface-2 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
          >
            {transitionButton.label}
          </button>

          {/* ADR-0058 D3·D4 — 요청 기록 전용. 이 버튼은 합성을 시작하지 않는다(D1). */}
          {canRequestTts && (
            <>
              <button
                type="button"
                disabled={isPending || detail.hasAudio}
                title={
                  detail.hasAudio
                    ? AUDIO_LOCK_REASON
                    : '팀장의 다음 생성 배치 대상으로 등록합니다.'
                }
                onClick={() => handleTransition('tts_requested')}
                className="inline-flex items-center rounded-md border border-outline bg-surface px-3 py-1 text-caption font-medium text-text transition-colors hover:bg-surface-2 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
              >
                TTS 생성 요청
              </button>
              {detail.hasAudio && (
                <span className="text-caption text-text-variant">
                  {AUDIO_LOCK_REASON}
                </span>
              )}
            </>
          )}
        </div>

        {statusError && (
          <p role="alert" className="text-label text-primary">
            {statusError}
          </p>
        )}
      </header>

      {detail.pages.length === 0 ? (
        <p className="rounded-lg border border-outline bg-surface p-4 text-label text-text-variant">
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
                  <span className="flex items-center gap-2 text-caption text-text-variant">
                    <span>{String(page.pageIndex + 1).padStart(2, '0')}면</span>
                    {rotated && (
                      <span
                        title="원본이 90° 회전 인쇄된 면입니다. 읽기순서가 뒤집혔을 수 있으니 확인해 주세요."
                        className="inline-flex items-center rounded border border-outline bg-surface-2 px-1.5 py-0.5 text-caption font-medium text-text"
                      >
                        ⚠ 회전 의심
                      </span>
                    )}
                  </span>
                  {/* 이미지 출처 = book_text.image_url(ADR-0057 D2). 외부 CDN·자체 Storage가
                      섞여 있고 도메인 화이트리스트 관리 대상이 아니므로 next/image 미사용.
                      asb-reader.tsx PageImage 선례 정합. */}
                  {page.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={page.imageUrl}
                      alt={`${detail.title} ${page.pageIndex + 1}면`}
                      className="h-auto w-full rounded-md bg-surface-2 object-contain"
                    />
                  ) : (
                    // ADR-0057 D3 — 빈 칸으로 두지 않는다. 검수자가 "이미지 결손"과
                    // "아직 안 뜬 이미지"를 구분할 수 있어야 한다.
                    <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed border-outline bg-surface-2 px-3 py-6 text-center text-caption text-text-variant">
                      이미지 없음 (텍스트 전용 면)
                    </div>
                  )}
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
                        className="w-full rounded-md border border-outline bg-surface-2 p-3 font-sans text-label leading-relaxed text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isPending || rowState.kind === 'saving'}
                          onClick={() => handleSave(page.pageIndex)}
                          className="inline-flex items-center rounded-md border border-outline bg-surface px-3 py-1 text-caption font-medium text-text transition-colors hover:bg-surface-2 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
                        >
                          저장
                        </button>
                        {rowState.kind === 'saving' && (
                          <span className="text-caption text-text-variant">
                            저장 중…
                          </span>
                        )}
                        {rowState.kind === 'saved' && (
                          <span className="text-caption text-text-variant">
                            저장됨
                          </span>
                        )}
                        {rowState.kind === 'error' && (
                          <span role="alert" className="text-caption text-primary">
                            {rowState.message}
                          </span>
                        )}
                        {rowState.kind === 'idle' && rowDirty && (
                          <span className="text-caption text-primary">
                            수정됨 · 저장 필요
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    /* in_review가 아니면 편집칸 잠금 — 읽기 전용 표시(ADR-0051 D3). */
                    <pre className="whitespace-pre-wrap break-words rounded-md bg-surface-2 p-3 font-sans text-label leading-relaxed text-text">
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
