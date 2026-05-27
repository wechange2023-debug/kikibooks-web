'use client';

import { Check, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';

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
 * 디자인 (design-system §6.1 Button Primary — read-button.tsx 형제 정합):
 *   bg-primary + text-on-primary + shadow-elev-pop + rounded-pill + h-[52px] (lg 액션).
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

    startTransition(async () => {
      // 성공 시 server action이 redirect(never)하므로, 값이 반환됐다는 것은 곧 실패다.
      const result = await completeReadingSession(bookId);
      setError(result.error);
    });
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending}
        className="inline-flex h-[52px] items-center justify-center gap-2 rounded-pill bg-primary px-8 text-base font-semibold text-on-primary shadow-elev-pop transition-all duration-200 ease-kiki hover:-translate-y-px hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-[0.38] disabled:hover:translate-y-0 disabled:hover:bg-primary"
      >
        {isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="h-5 w-5" aria-hidden="true" />
        )}
        {isPending ? copy.completingLabel : copy.buttonLabel}
      </button>

      {error && (
        <p role="alert" className="text-sm font-medium text-error">
          {error}
        </p>
      )}
    </div>
  );
}
