'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { BookReaderCopy } from '@/lib/book/copy';

/**
 * HtmlReader — content_type='html' 책 본문 iframe 리더 (ADR-0017 D1 단일 경로).
 *
 * 외부 호스팅 책 본문(Book Dash bookdash.github.io · GDL content.digitallibrary.io)을
 * cross-origin iframe으로 임베드한다. 활성 책 896/896 = 100% 'html'이라 베타 뷰어는
 * 본 컴포넌트 단일 경로로 수렴한다(ADR-0017 D1·D2). epub·h5p·pdf 분기 골격은 read
 * page가 보유하고, 본 컴포넌트는 html 전용이다.
 *
 * 보안 (ADR-0017 D6):
 *   - sandbox="allow-scripts allow-same-origin" — 외부 리더 JS 동작에 필수.
 *     allow-same-origin은 iframe '자기 출처'(bookdash.github.io / digitallibrary.io)
 *     기준이라 부모(키키북스 origin) 탈출 불가. 추가 권한은 부여하지 않는다
 *     (GDL SPA 동작 미달 시 allow-forms·allow-popups 최소 보강 — F14, CP3-a 검수).
 *   - 부모 CSP frame-src 화이트리스트는 middleware.ts가 보강한다(CP3-a-4).
 *   - referrerPolicy="no-referrer" — 외부 사이트에 referrer 전달 0건(학부모·자녀
 *     privacy). 협업으로 referrer가 필요해지면 phase-2+ 재검토.
 *
 * 로딩·실패 폴백 (F15 — iframe 외부 가용성):
 *   - status 'loading' → 'loaded'(onLoad) | 'error'(onError 또는 5초 타임아웃).
 *   - 5초 타임아웃 근거: 일반 네트워크 지연 평균 2~3초 + 안전 여유. 초과 시 백지
 *     화면 대신 폴백 UI(errorTitle·errorBody + 책 상세 돌아가기)를 노출한다.
 *   - cross-origin iframe은 일부 브라우저에서 onError가 발화하지 않으므로, 5초
 *     타임아웃이 이중 안전망 역할을 한다.
 *   - setTimeout은 useEffect cleanup에서 clearTimeout으로 해제(unmount leak 방지).
 *   - 함수형 setStatus로 onLoad·타임아웃 경합을 안전하게 처리(이미 error면 무시).
 *
 * 디자인 (design-system §7.2 html 행 + Hard Rule 10 raw HEX 0건):
 *   - iframe 컨테이너: bg-surface-3 + rounded-lg(24px) + shadow-elev-2.
 *   - 뷰어 좌우 여백: px-4(16px) / md:px-8(32px) / lg:px-16(64px) (§7.2).
 *   - 모든 색·반경·그림자는 Tailwind semantic 토큰만(인라인 스타일·raw HEX 0건).
 *
 * Client Component — useState(status) + useEffect(타임아웃) + iframe 이벤트 핸들러.
 * BookReaderCopy는 `import type`(컴파일 시 erase)이라 server-only 런타임 미유입.
 *
 * 의도 문서: docs/intent/screen-04-reader.md §5.1
 */

/** iframe 로딩 타임아웃 — 일반 네트워크 지연 + 안전 여유(F15 폴백 트리거). */
const LOAD_TIMEOUT_MS = 5000;

type ReaderStatus = 'loading' | 'loaded' | 'error';

interface HtmlReaderProps {
  /** 책 본문 iframe src — book.content_url(Book Dash · GDL). */
  src: string;
  /** iframe 접근성 라벨 — book.title. */
  title: string;
  /** 로딩·폴백 카피(lib/book/copy.ts getBookReaderCopy().reader). */
  readerCopy: BookReaderCopy['reader'];
  /** 폴백 '책 상세로 돌아가기' 링크 — `/book/${book.id}`. */
  bookDetailHref: string;
}

export function HtmlReader({ src, title, readerCopy, bookDetailHref }: HtmlReaderProps) {
  const [status, setStatus] = useState<ReaderStatus>('loading');

  useEffect(() => {
    const timer = setTimeout(() => {
      // 5초 내 onLoad 미발화 시에만 error 전환(이미 loaded/error면 무시).
      setStatus((prev) => (prev === 'loading' ? 'error' : prev));
    }, LOAD_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, []);

  const handleLoad = () => {
    setStatus((prev) => (prev === 'loading' ? 'loaded' : prev));
  };

  const handleError = () => {
    setStatus('error');
  };

  return (
    <div className="flex h-full w-full flex-col px-4 py-4 md:px-8 lg:px-16">
      <div className="relative flex h-full w-full flex-1 overflow-hidden rounded-lg bg-surface-3 shadow-elev-2">
        {status === 'error' ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="font-display text-lg font-semibold text-text">
              {readerCopy.errorTitle}
            </p>
            <p className="text-sm text-text-variant">{readerCopy.errorBody}</p>
            <Link
              href={bookDetailHref}
              className="mt-2 inline-flex h-11 items-center justify-center rounded-pill border border-outline bg-surface px-6 text-sm font-semibold text-text transition-colors duration-200 ease-kiki hover:bg-surface-2"
            >
              {readerCopy.backToDetailLabel}
            </Link>
          </div>
        ) : (
          <>
            <iframe
              src={src}
              title={title}
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
              loading="eager"
              onLoad={handleLoad}
              onError={handleError}
              className="h-full w-full border-0"
            />
            {status === 'loading' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-3">
                <div
                  aria-hidden="true"
                  className="h-10 w-10 animate-spin rounded-full border-4 border-surface-2 border-t-primary"
                />
                <p className="text-sm text-text-variant">{readerCopy.loading}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
