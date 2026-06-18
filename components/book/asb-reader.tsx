'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { BookReaderCopy } from '@/lib/book/copy';
import { parseAsbText, type AsbBook } from '@/lib/book/asb-parser';
import { startReadingSession } from '@/lib/book/reading-session';

/**
 * AsbReader — content_type='asb_native' 책 본문 자체 렌더 리더 (ADR-0025 Amd#3·#6).
 *
 * ASb는 외부 임베드 URL이 없고 raw `.txt`(content_url)만 보유하므로, 마운트 시 `.txt`를
 * fetch → parseAsbText(raw, coverUrl)로 페이지 구조(AsbBook)를 만들어 자체 렌더한다.
 * iframe 임베드(HtmlReader)와 달리 외부 트래킹·외부 종속 0(ADR-0025 Amd#3 결정).
 *
 * 페이지 구성 (ADR-0025 Amd#6):
 *   - 표지면 = AsbBook.coverUrl 단독 1면(맨 앞). 본문 pages와 분리(A1).
 *   - 본문면 = pages[]. 각 면은 이미지(있으면)+텍스트(있으면). 한쪽만 있는 면도 정상(A3).
 *   - 텍스트·이미지 짝짓기·max(N,M) 면 생성은 parseAsbText가 책임(A2/A4). 본 컴포넌트는
 *     parser 결과를 순서대로 넘길 뿐, 재정렬·강제 1:1을 하지 않는다.
 *
 * 책임 경계 (read/page.tsx recon):
 *   - 본 컴포넌트는 '읽기 화면(<main>)'만 책임진다. 상단 어트리뷰션 바(ReaderAttributionBar)·
 *     하단 완독 버튼(FinishButton)은 page.tsx 레벨에서 reader 바깥에 배치되므로 여기서
 *     새로 만들지 않는다.
 *   - 세션 시작은 본 컴포넌트가 책임진다 — HtmlReader와 동일하게 마운트 시
 *     startReadingSession(bookId)를 1회 호출한다(완독 시 FinishButton의
 *     completeReadingSession이 동일 세션을 재조회, CP3-b-2 가드 키 대칭).
 *
 * 실패 폴백 (html-reader / 미지원 분기 톤과 일관):
 *   - .txt fetch 실패·파싱 결과 0면 → errorTitle/errorBody + 원본(original_url) 외부 링크 +
 *     책 상세 돌아가기. 개별 페이지 이미지 깨짐은 PageImage가 그 자리만 비우고 텍스트는 유지
 *     (전체 리더를 막지 않는다).
 *
 * 디자인 (유아 대상): 큰 이미지(object-contain) + 큰 본문 텍스트 + 좌우 페이지 넘김.
 *   색·반경·그림자는 Tailwind semantic 토큰만(Hard Rule 10, raw HEX 0건).
 *   bg-surface-3 + rounded-lg + shadow-elev-2 컨테이너(§7.2 뷰어 표면 정합).
 *
 * Client Component — useState(상태·book·페이지 인덱스) + useEffect(fetch·세션시작).
 */

type ReaderStatus = 'loading' | 'loaded' | 'error';

interface AsbReaderProps {
  /** 세션 시작 대상 책 — 마운트 시 startReadingSession(bookId) 호출. */
  bookId: string;
  /** ASb raw `.txt` URL — book.content_url(parseAsbText 입력). */
  contentUrl: string;
  /** 표지 절대 URL — book.cover_url(Amd#6 A1, pages와 분리). */
  coverUrl: string | null;
  /** 책 제목 — 표지 이미지 alt + 페이지 라벨. */
  title: string;
  /** 원본 외부 링크 — book.original_url(실패 폴백 '원본에서 보기'). */
  originalUrl: string;
  /** '원본에서 보기' 라벨 — getBookReaderCopy().unsupportedFormat.originalLinkLabel. */
  originalLinkLabel: string;
  /** 로딩·에러 카피 — getBookReaderCopy().reader(HtmlReader와 동일 슬라이스). */
  readerCopy: BookReaderCopy['reader'];
  /** 폴백 '책 상세로 돌아가기' 링크 — `/book/${book.id}`. */
  bookDetailHref: string;
}

/** 렌더 1면 — 표지 또는 본문 페이지. */
type Face = {
  /** 면 이미지 절대 URL(없으면 null — 텍스트만 면). */
  imageUrl: string | null;
  /** 면 텍스트(표지·이미지만 면이면 null). */
  text: string | null;
  /** 표지면 여부(이미지 alt·라벨 분기용). */
  isCover: boolean;
};

/** AsbBook → 렌더 면 배열(표지 1면 + 본문 pages). coverUrl 없으면 표지면 생략. */
function toFaces(book: AsbBook): Face[] {
  const faces: Face[] = [];
  if (book.coverUrl) {
    faces.push({ imageUrl: book.coverUrl, text: null, isCover: true });
  }
  for (const page of book.pages) {
    faces.push({ imageUrl: page.imageUrl, text: page.text, isCover: false });
  }
  return faces;
}

/** 현재 면 기준 앞뒤로 미리 받아둘 면 수(인접 프리로드 반경, ±N). 초기 폭주 방지. */
const PREFETCH_RADIUS = 2;

type ImagePhase = 'loading' | 'loaded' | 'failed';

/**
 * PageImage — 개별 면 이미지. 호출 측이 key={src}로 마운트하므로 src가 바뀌면 새 노드가
 * 떠 이전 이미지 잔상이 남지 않고(req3), 같은 src로 되돌아오면 재마운트되지 않아(+브라우저
 * 캐시) 재요청이 없다(req2).
 *   - loading: 스피너 placeholder를 덮고, img는 opacity-0으로 로딩(onLoad/onError 부착).
 *   - loaded: img를 보인다(fade-in).
 *   - failed(onError): 자기 자리만 비운다(텍스트는 부모가 유지) — 깨진 이미지 1장이 전체
 *     리더를 막지 않게 한다(Amd#6 실패 격리).
 */
function PageImage({
  src,
  alt,
  onLoadError,
}: {
  src: string;
  alt: string;
  /** 이미지 로드 실패 시 부모에 올리는 신호(표지면 폴백용). 본문면은 미연결. */
  onLoadError?: () => void;
}) {
  const [phase, setPhase] = useState<ImagePhase>('loading');
  if (phase === 'failed') {
    return null;
  }
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {phase === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2
            aria-hidden="true"
            className="h-8 w-8 animate-spin text-primary"
          />
        </div>
      )}
      {/* 자체 렌더 본문 일러스트 — 외부 CDN(africanstorybook.org) 임의 경로라 next/image
          대신 평문 img(원격 도메인 화이트리스트·최적화 불요, Hard Rule 10 색 토큰 무관). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onLoad={() => setPhase('loaded')}
        onError={() => {
          setPhase('failed');
          onLoadError?.();
        }}
        className={`max-h-full max-w-full object-contain transition-opacity duration-200 ease-kiki ${
          phase === 'loaded' ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}

export function AsbReader({
  bookId,
  contentUrl,
  coverUrl,
  title,
  originalUrl,
  originalLinkLabel,
  readerCopy,
  bookDetailHref,
}: AsbReaderProps) {
  const [status, setStatus] = useState<ReaderStatus>('loading');
  const [faces, setFaces] = useState<Face[]>([]);
  const [index, setIndex] = useState(0);

  // 세션 시작 — 마운트 1회(HtmlReader와 동일, intent §5.1). 실패는 silent(읽기 흐름 유지).
  useEffect(() => {
    startReadingSession(bookId).catch(() => {
      // 네트워크 오류 등 — 의도적 silent fail.
    });
  }, [bookId]);

  // 본문 .txt fetch + 파싱 — 클라이언트 마운트 후 1회. abort·언마운트 가드.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    (async () => {
      try {
        const res = await fetch(contentUrl, { signal: controller.signal });
        if (!res.ok) {
          throw new Error(`fetch ${res.status}`);
        }
        const raw = await res.text();
        const book = parseAsbText(raw, coverUrl);
        const next = toFaces(book);
        if (!active) return;
        if (next.length === 0) {
          // 표지·본문 모두 없음 → 보여줄 면 0 → 에러 폴백.
          setStatus('error');
          return;
        }
        setFaces(next);
        setStatus('loaded');
      } catch {
        if (active) setStatus('error');
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [contentUrl, coverUrl]);

  // 인접 ±PREFETCH_RADIUS면 이미지 프리로드 — 넘기기 전에 브라우저 캐시에 받아둔다(req1).
  // new Image()로 받아두면 같은 src를 표시 <img>가 요청할 때 캐시 히트(재요청 0, req2).
  // 한 번에 전체 N면이 아니라 인접 ±N(최대 2N+1장)만 요청해 초기 폭주를 막는다.
  useEffect(() => {
    if (faces.length === 0) return;
    for (let d = -PREFETCH_RADIUS; d <= PREFETCH_RADIUS; d++) {
      const url = faces[index + d]?.imageUrl;
      if (!url) continue;
      const img = new Image();
      img.src = url;
    }
  }, [index, faces]);

  if (status === 'loading') {
    return (
      <div className="flex h-full w-full flex-col px-4 py-4 md:px-8 lg:px-16">
        <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-3 rounded-lg bg-surface-3 shadow-elev-2">
          <Loader2
            aria-hidden="true"
            className="h-10 w-10 animate-spin text-primary"
          />
          <p className="text-sm text-text-variant">{readerCopy.loading}</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex h-full w-full flex-col px-4 py-4 md:px-8 lg:px-16">
        <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-3 rounded-lg bg-surface-3 px-6 text-center shadow-elev-2">
          <p className="font-display text-lg font-semibold text-text">
            {readerCopy.errorTitle}
          </p>
          <p className="text-sm text-text-variant">{readerCopy.errorBody}</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <a
              href={originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-pill border border-outline bg-surface px-6 text-sm font-semibold text-text transition-colors duration-200 ease-kiki hover:bg-surface-2"
            >
              {originalLinkLabel}
            </a>
            <Link
              href={bookDetailHref}
              className="inline-flex h-11 items-center justify-center rounded-pill border border-outline bg-surface px-6 text-sm font-semibold text-text transition-colors duration-200 ease-kiki hover:bg-surface-2"
            >
              {readerCopy.backToDetailLabel}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // loaded — 현재 면 표시 + 좌우 페이지 넘김.
  const total = faces.length;
  const face = faces[index];
  const isFirst = index === 0;
  const isLast = index === total - 1;

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => setIndex((i) => Math.min(total - 1, i + 1));

  // 표지 이미지 로드 실패(404 등) → 표지면(항상 index 0)을 faces에서 제거(Amd#6 표지 폴백).
  // 첫 본문 이미지가 자연히 첫 장이 되고, total = faces.length 라 "현재/전체"도 자동 보정.
  // isCover 면에만 연결되므로 본문 이미지 깨짐은 이 로직을 타지 않는다(기존 거동 유지).
  // filter는 멱등이라 중복 호출도 무해(별도 플래그 불필요). 표지 제거 시 인덱스가 밀리지
  // 않게 index도 한 칸 당긴다(표지는 대개 index 0에서 즉시 깨져 0 유지).
  const handleCoverError = () => {
    setFaces((prev) => prev.filter((f) => !f.isCover));
    setIndex((i) => Math.max(0, i - 1));
  };

  return (
    <div className="flex h-full w-full flex-col gap-3 px-4 py-4 md:px-8 lg:px-16">
      {/* 본문 면 — 큰 이미지 + 큰 텍스트(유아 대상). */}
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-lg bg-surface-3 p-4 shadow-elev-2 md:p-6">
        {face.imageUrl && (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {/* key=imageUrl: src 변경 시 새 노드(잔상 제거), 같은 URL 재방문 시 재마운트
                회피 + 브라우저 캐시 히트(재요청 0). */}
            <PageImage
              key={face.imageUrl}
              src={face.imageUrl}
              alt={face.isCover ? title : ''}
              onLoadError={face.isCover ? handleCoverError : undefined}
            />
          </div>
        )}
        {face.text && (
          <p className="w-full max-w-3xl shrink-0 whitespace-pre-line break-keep text-center font-display text-xl font-semibold leading-relaxed text-text md:text-2xl">
            {face.text}
          </p>
        )}
      </div>

      {/* 페이지 넘김 — 이전/다음 + 진행 표시. */}
      <div className="flex shrink-0 items-center justify-between gap-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={isFirst}
          aria-label="이전 페이지"
          className="inline-flex h-12 w-12 items-center justify-center rounded-pill border border-outline bg-surface text-text shadow-elev-1 transition-all duration-200 ease-kiki hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-[0.38] disabled:hover:bg-surface"
        >
          <ChevronLeft className="h-6 w-6" aria-hidden="true" />
        </button>

        <span
          aria-live="polite"
          className="text-sm font-semibold text-text-variant"
        >
          {index + 1} / {total}
        </span>

        <button
          type="button"
          onClick={goNext}
          disabled={isLast}
          aria-label="다음 페이지"
          className="inline-flex h-12 w-12 items-center justify-center rounded-pill border border-outline bg-surface text-text shadow-elev-1 transition-all duration-200 ease-kiki hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-[0.38] disabled:hover:bg-surface"
        >
          <ChevronRight className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
