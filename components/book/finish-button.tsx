'use client';

import { Check, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';

import {
  READER_LEAVING_EVENT,
  READER_STAY_EVENT,
} from '@/components/book/reader-exit-guard';
import type { BookReaderCopy } from '@/lib/book/copy';
import { completeReadingSession } from '@/lib/book/reading-session';

/**
 * FinishButton — 명시 완독 버튼 ('다 읽었어요', ADR-0017 D4).
 *
 * 자동 마지막-페이지 감지가 불가능한 cross-origin 환경(D3)에서 완독을 사용자 명시
 * 행동으로 매듭짓는다. 클릭 → completeReadingSession(bookId) server action →
 * 성공 시 server가 /book/[id]/celebrate로 redirect한다(intent §5.3 L131).
 *
 * 통신 계약 (CP3-b-2 정합):
 *   completeReadingSession은 성공 시 redirect(never)하고, 실패 시에만
 *   { ok: false; error } 값을 반환한다. 따라서 await가 값을 반환했다는 것 자체가
 *   곧 실패를 의미하므로 success 처리 코드가 0건이다 — error 메시지만 노출한다.
 *
 * useTransition 채택 사유 (form action 대신):
 *   FinishButton은 입력 필드가 없는 단일 trigger 버튼이라 <form> 시맨틱이 과하다.
 *   useTransition은 form 없이 server action 호출 + isPending(중복 클릭 방지)을 제공해
 *   더 가볍다. level-selector.tsx와 동일 패턴(useState 에러 + useTransition pending).
 *
 * props 규약:
 *   - bookId 1개만 데이터 props로 받는다 — sessionId는 server가 (child_id, book_id,
 *     completed_at IS NULL)로 재조회하므로 threading하지 않는다(CP3-b-2 시그니처 확정).
 *   - copy는 ADR-0012 결정 2대로 페이지가 getBookReaderCopy().finish를 props로 주입한다
 *     (copy.ts는 server-only·BOOK_READER_COPY 미export → client 직접 import 불가).
 *     `import type`이므로 server-only 런타임은 유입되지 않는다.
 *
 * 디자인 (design-system §6.1 Button CTA — read-button.tsx 형제 정합):
 *   bg-cta + text-on-cta + shadow-elev-cta + rounded-pill + h-[52px] (lg 액션, §6.1 CTA).
 *
 *   ★ 375px 대응(2026-08-20 재측정): 오디오 리더 하단은 grid-cols-[1fr_auto_1fr]이라
 *     우측 열이 **131.5px**뿐이다(브라우저 실측 — 이전 보고의 139.5px은 오산이었다).
 *     px-8+아이콘 174.8px → px-3+아이콘 134.8px로도 **3.3px 초과**라 줄바꿈이 남았다.
 *     아이콘까지 sm 미만에서 접어 **106.8px**(진행 중 121.6px)로 내렸다 — 여유 24.7px.
 *     h-[52px]는 그대로라 터치 타깃 44px 하한(§6.5 :478) 유지.
 *   pending 시 disabled + opacity-[0.38](§ level-selector 토큰) + Loader2 스피너 +
 *   completingLabel. raw HEX 0건(Hard Rule 10).
 *
 * phase-13 경계: 본 컴포넌트·completeReadingSession 모두 children.points·child_badges
 *   쓰기 0건. 별 애니메이션·보상은 phase-13 /celebrate 전속(D7·d9).
 *
 * Client Component — useState(error) + useTransition(pending) + server action 호출.
 *
 * 의도 문서: docs/intent/screen-04-reader.md §5.3
 */

interface FinishButtonProps {
  /** 완독 처리할 책 — completeReadingSession(bookId)에 전달. */
  bookId: string;
  /** 완독 버튼 카피(getBookReaderCopy().finish) — 페이지가 props로 주입. */
  copy: BookReaderCopy['finish'];
}

export function FinishButton({ bookId, copy }: FinishButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    if (isPending) {
      return;
    }
    setError(null);

    // ★ 이탈 가드 내리기 (2026-08-21 A안). 완독은 **정상 이탈**인데, 서버액션의
    //   redirect가 MPA 폴백으로 문서를 언로드할 수 있어 ReaderExitGuard의
    //   beforeunload가 발화했다 — 아이 화면에 브라우저 기본 경고("사이트에서
    //   나갈까요?")가 떴다. 호출 **직전**에 신호를 보내 가드를 내린다.
    //   가드가 없는 화면(HtmlReader·AsbReader 경로)에서는 수신자가 없어 무해하다.
    window.dispatchEvent(new Event(READER_LEAVING_EVENT));

    startTransition(async () => {
      // 성공 시 server action이 redirect(never)하므로, 값이 반환됐다는 것은 곧 실패다.
      const result = await completeReadingSession(bookId);

      // ★ `result` 존재 여부로 분기한다 (2026-08-21 실측 교정).
      //   Next는 서버액션 redirect를 **이동 직전에 프로미스부터 resolve**한다
      //   (server-action-reducer.js:115 `resolve(actionResult)` → :118 `handleExternalUrl`).
      //   그래서 **성공 경로에서도 이 자리가 실행된다** — 다만 redirect 응답에는
      //   actionResult가 없어 `result`는 undefined다. 무조건 복구를 쏘면 언로드 직전에
      //   가드가 다시 켜져 경고가 되살아난다(실측으로 STAY 발신 확인).
      //   값이 실제로 온 경우 = 실패 = 리더에 그대로 남는 경우에만 보호를 되살린다.
      //   (덤으로 종전의 `result.error` 무조건 접근도 안전해진다.)
      if (result) {
        window.dispatchEvent(new Event(READER_STAY_EVENT));
        setError(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending}
        className="inline-flex h-[52px] items-center justify-center gap-2 whitespace-nowrap rounded-pill bg-cta px-3 text-body font-semibold text-on-cta shadow-elev-cta sm:px-8 transition-all duration-200 ease-kiki hover:-translate-y-px hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-[0.38] disabled:hover:translate-y-0 disabled:hover:bg-cta"
      >
        {/* 375px 실측(2026-08-20): 리더 하단 우측 그리드 열은 **131.5px**뿐이다.
            아이콘(20px)+gap(8px)을 포함하면 기본 134.8px·진행 중 149.6px로 열을 넘어
            줄바꿈이 난다. 아이콘은 aria-hidden 장식이므로 sm 미만에서 접는다 —
            접으면 106.8px / 121.6px로 각각 24.7px·9.9px 여유가 생긴다.
            라벨 텍스트와 aria-busy가 남아 정보 손실은 0이다. */}
        {isPending ? (
          <Loader2
            className="hidden h-5 w-5 animate-spin sm:block"
            aria-hidden="true"
          />
        ) : (
          <Check className="hidden h-5 w-5 sm:block" aria-hidden="true" />
        )}
        {isPending ? copy.completingLabel : copy.buttonLabel}
      </button>

      {error && (
        <p role="alert" className="text-label font-medium text-error">
          {error}
        </p>
      )}
    </div>
  );
}
