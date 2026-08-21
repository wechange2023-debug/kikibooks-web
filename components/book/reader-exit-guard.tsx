'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { BookReaderCopy } from '@/lib/book/copy';

/**
 * ReaderExitGuard — 리더 이탈 확인 가드 (UX Wave 2 F5 뒤로가기 보호).
 *
 * 아이가 브라우저 뒤로가기를 눌러 읽던 책에서 그대로 튕겨 나가는 문제
 * (docs/intent/ux-feedback-2026-07-22.md F5)를 확인 1단계로 막는다.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 두 가지 이탈 경로 · 두 가지 방어
 * ──────────────────────────────────────────────────────────────────────────────
 *   ① 브라우저 뒤로가기(같은 탭 내 히스토리 이동) → **자체 모달**
 *      마운트 시 현재 URL로 sentinel 히스토리 항목을 하나 push해 둔다. 뒤로가기가
 *      이 항목을 소비하면 popstate가 오는데, 이때 sentinel을 다시 push해 화면을
 *      제자리에 붙잡고 모달을 띄운다. '계속 읽기'는 모달만 닫으면 되고(이미 재-push
 *      완료), '나가기'는 책 상세로 replace 이동한다 — 헤더 뒤로가기 버튼과 같은 목적지.
 *   ② 탭 닫기·새로고침·외부 주소 이동 → **브라우저 기본 확인창(beforeunload)**
 *      이 경로는 사양상 커스텀 UI를 띄울 수 없다(문구도 브라우저가 정한다).
 *      따라서 ①만 우리 카피를 쓰고, ②는 "정말 나갈까요?" 계열 기본창으로 대체된다.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 완독(정상 흐름)은 보호 대상이 아니다 — **명시 신호로 가드를 내린다**
 * ──────────────────────────────────────────────────────────────────────────────
 *   ★ 2026-08-21 정정. 종전 주석은 "완독 → /celebrate는 클라이언트 라우팅이라
 *     beforeunload가 발화하지 않는다 = 접점 0건"이라고 단언했는데 **사실이 아니었다.**
 *     서버액션의 `redirect()`는 응답이 RSC flight가 아니면 Next가 **MPA 폴백**으로
 *     전체 페이지 이동을 한다(node_modules/next/dist/client/components/router-reducer/
 *     reducers/server-action-reducer.js:114-120 `handleExternalUrl`). 그때 문서가
 *     언로드되어 아래 beforeunload가 발화하고, 아이 화면에 브라우저 기본 경고가 떴다
 *     (팀장 프로덕션 실측 2026-08-21). 도입(2026-07-24) 이래 계속 있던 결함이다.
 *
 *   그래서 완독 흐름이 **직접 가드를 내린다**. FinishButton이 서버액션 호출 직전에
 *   `READER_LEAVING_EVENT`를 쏘고, 본 컴포넌트가 그것을 받아 `leavingRef`를 켠다 —
 *   모달의 '나가기'와 **같은 경로**이므로 새 개념이 아니다.
 *   완독이 실패해 페이지에 남는 경우에는 `READER_STAY_EVENT`로 보호를 되살린다.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 오디오·하이라이트와의 관계
 * ──────────────────────────────────────────────────────────────────────────────
 *   본 컴포넌트는 AudioReader 형제로 마운트되며 재생 상태를 알지도, 건드리지도 않는다
 *   (props·ref 공유 0건). 모달이 떠 있어도 오디오는 그대로 재생된다 — 잠깐 멈추게 하는
 *   편이 나은지는 팀장 검수 후 결정한다(현 단계에서 재생 로직에 손대지 않는 것이 원칙).
 *
 * 적용 범위: 오디오 리더 분기 한정(read/page.tsx). HtmlReader·AsbReader(896권)는
 *   intent 문서가 "기존 뷰어와 동작 일관성 검토 필요"로 미결 처리해 이번 범위에서 제외한다.
 *   확장은 page.tsx에서 본 컴포넌트를 한 줄 더 마운트하면 된다.
 *
 * Client Component — history/beforeunload 접근이 필요해 'use client'.
 */

interface ReaderExitGuardProps {
  /** '나가기' 선택 시 이동할 책 상세 경로. 헤더 뒤로가기와 같은 목적지. */
  bookDetailHref: string;
  /** 모달 카피(getBookReaderCopy().exitGuard) — page.tsx가 주입(server-only 우회). */
  copy: BookReaderCopy['exitGuard'];
}

/** sentinel 히스토리 항목 식별자. 중복 push 방지 판별에 쓴다. */
const GUARD_STATE_KEY = '__kikiReaderExitGuard';

/**
 * "지금 나가는 것은 정상 흐름이다" 신호 — 받으면 가드를 내린다.
 *
 * 가드와 완독 버튼은 형제로 마운트돼 props·ref를 공유하지 않으므로
 * (read/page.tsx가 각각 별도로 배치한다) window 이벤트를 통로로 쓴다.
 * **문자열 계약이라 반드시 이 상수를 import해 쓴다** — 양쪽이 문자열을 각자
 * 적으면 오타 하나로 조용히 동작하지 않는다(경고가 다시 뜨는 회귀).
 */
export const READER_LEAVING_EVENT = 'kiki:reader-leaving';

/**
 * "이탈이 취소됐다" 신호 — 받으면 가드를 되살린다.
 *
 * 완독 서버액션이 **실패를 반환하면 사용자는 리더에 그대로 남는다**. 그때 가드가
 * 내려간 채로 두면 이후 탭 닫기·새로고침이 무방비가 되므로 원상 복구한다.
 */
export const READER_STAY_EVENT = 'kiki:reader-stay';

export function ReaderExitGuard({ bookDetailHref, copy }: ReaderExitGuardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // '나가기' 확정 후에는 가드를 스스로 해제한다(이탈 도중 모달·확인창 재발 방지).
  const leavingRef = useRef(false);

  /** 현재 URL로 sentinel 항목을 push. Next 라우터 내부 state는 보존한다. */
  const pushSentinel = useCallback(() => {
    const current = window.history.state as Record<string, unknown> | null;
    // 이미 sentinel 위에 서 있으면 다시 쌓지 않는다(dev StrictMode 이중 마운트 대비).
    if (current && current[GUARD_STATE_KEY] === true) return;
    // state를 통째로 갈아끼우면 App Router의 뒤로가기 복원이 깨진다 — 스프레드로 보존하고
    // 우리 플래그만 얹는다. url 인자를 주지 않아 주소는 그대로다.
    window.history.pushState({ ...(current ?? {}), [GUARD_STATE_KEY]: true }, '');
  }, []);

  useEffect(() => {
    pushSentinel();

    const onPopState = () => {
      if (leavingRef.current) return; // 이탈 확정 후의 이동은 통과시킨다.
      pushSentinel(); // 제자리에 붙잡아 둔다 — 실제 이탈은 모달 선택으로만.
      setOpen(true);
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      // 사양상 preventDefault + returnValue 지정이 곧 "확인창 표시" 요청이다.
      e.preventDefault();
      e.returnValue = '';
    };

    // 완독 등 정상 이탈 흐름이 보내는 신호 — 모달 '나가기'와 같은 효과다.
    const onLeaving = () => {
      leavingRef.current = true;
    };
    // 이탈이 취소됐을 때(완독 실패 등) 보호를 되살린다.
    const onStay = () => {
      leavingRef.current = false;
    };

    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener(READER_LEAVING_EVENT, onLeaving);
    window.addEventListener(READER_STAY_EVENT, onStay);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener(READER_LEAVING_EVENT, onLeaving);
      window.removeEventListener(READER_STAY_EVENT, onStay);
    };
  }, [pushSentinel]);

  const stay = useCallback(() => setOpen(false), []);

  const leave = useCallback(() => {
    leavingRef.current = true;
    setOpen(false);
    // sentinel 위에 서 있으므로 back()은 read 페이지 자신으로 되돌아가 혼란스럽다.
    // 헤더 뒤로가기와 동일하게 책 상세로 보내되, sentinel을 남기지 않도록 replace를 쓴다.
    router.replace(bookDetailHref);
  }, [router, bookDetailHref]);

  // Esc = '계속 읽기'(안전한 쪽). 어트리뷰션 팝오버와 동일하게 열려 있을 때만 건다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, stay]);

  if (!open) return null;

  return (
    // 배경은 색 투명도 대신 backdrop-blur-sm — Tailwind v3에서 hex 토큰 + 투명도
    // 모디파이어가 렌더되지 않는 문제를 피한다(AudioReader 어트리뷰션 팝오버와 동일 패턴).
    <div
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      className="fixed inset-0 z-40 flex items-end justify-center backdrop-blur-sm sm:items-center"
    >
      {/* 배경 탭 = '계속 읽기'. 실수로 나가지지 않도록 안전한 쪽으로 붙인다. */}
      <button
        type="button"
        aria-label={copy.stayLabel}
        onClick={stay}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <div className="relative z-10 m-3 w-full max-w-sm rounded-lg border border-outline bg-surface p-5 text-center shadow-elev-modal">
        <h2 className="font-body text-h3 font-semibold text-text">{copy.title}</h2>
        <p className="mt-2 break-keep text-label text-text-variant">{copy.body}</p>
        {/* 주 동작('계속 읽기')을 오른쪽·primary로 둔다 — 아이가 습관적으로 누르는 자리에
            이탈이 아니라 복귀가 오도록. */}
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={leave}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-pill border border-outline bg-surface px-5 text-label font-semibold text-text-variant transition-colors duration-200 ease-kiki hover:bg-surface-2"
          >
            {copy.leaveLabel}
          </button>
          <button
            type="button"
            onClick={stay}
            autoFocus
            className="inline-flex h-11 flex-1 items-center justify-center rounded-pill bg-primary px-5 text-label font-semibold text-on-primary shadow-elev-2 transition-all duration-200 ease-kiki hover:bg-primary-hover"
          >
            {copy.stayLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
