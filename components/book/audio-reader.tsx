'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pause,
  Play,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { HighlightedText, type WordMark } from '@/components/book/highlighted-text';
import { AUTO_ADVANCE_DELAY_MS, HIGHLIGHT_UNIT } from '@/lib/book/highlight-config';
import type { ReaderAudioBook } from '@/lib/book/audio-manifest';

/**
 * AudioReader — book_dash 시범 12권용 자체 오디오 리더 (ADR-0052 Phase D).
 *
 * 이미지 + 자막 + TTS 재생/일시정지 + 단어 하이라이트 + 자동 페이지 넘김.
 * 레이아웃은 **한 컴포넌트 내 반응형 분기**(팀장 확정, MobileReader/DesktopReader 분리 금지):
 *   - 좁은 화면(모바일 세로): 세로 1단 — 헤더→이미지→자막→진행바→컨트롤→자동넘김.
 *   - 넓은 화면(lg↑, PC·태블릿 가로): 좌우 2단 — 좌 이미지(~60%) / 우 패널(자막·진행바·컨트롤,
 *     세로 중앙). 헤더·(어트리뷰션)은 상하단 전체 폭.
 *
 * 하이라이트: HighlightedText가 담당. 단위 전환은 HIGHLIGHT_UNIT 한 곳(ADR-0052 D7).
 * 색·반경은 Tailwind semantic 토큰만(Hard Rule 10). AsbReader PageImage 패턴 정합.
 *
 * 어트리뷰션 바는 본 컴포넌트 밖(page.tsx 레벨)에 둔다(AsbReader 책임 경계 정합).
 *
 * 오디오/marks base는 audio-manifest가 URL로 조립해 넘긴다(업로드 전 로컬 /tts-dev, 이후 Storage).
 */

interface AudioReaderProps {
  book: ReaderAudioBook;
  /** 뒤로가기 대상(책 상세). */
  bookDetailHref: string;
  /** 뒤로가기 라벨. */
  backLabel?: string;
}

/** line-delimited speech marks JSON 파싱(word만). */
function parseMarks(raw: string): WordMark[] {
  const out: WordMark[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const m = JSON.parse(t) as Partial<WordMark> & { type?: string };
      if (m.type === 'word' && typeof m.time === 'number') {
        out.push({
          time: m.time,
          value: String(m.value ?? ''),
          start: Number(m.start),
          end: Number(m.end),
        });
      }
    } catch {
      // 깨진 줄은 건너뛴다(하이라이트만 영향, 재생 무관).
    }
  }
  return out;
}

/** 현재 재생시각(ms) 기준 활성 mark 인덱스 — time <= now 인 마지막 mark. 없으면 -1. */
function activeMarkIndex(marks: WordMark[], nowMs: number): number {
  let idx = -1;
  for (let i = 0; i < marks.length; i++) {
    if (marks[i].time <= nowMs) idx = i;
    else break;
  }
  return idx;
}

type ImagePhase = 'loading' | 'loaded' | 'failed';

/** 페이지 이미지 — object-contain, 로딩 스피너, 실패 시 자리 비움(AsbReader 패턴). */
function PageImage({ src, alt }: { src: string; alt: string }) {
  const [phase, setPhase] = useState<ImagePhase>('loading');
  const imgRef = useRef<HTMLImageElement>(null);
  // 캐시/즉시 완료된 이미지는 onLoad가 핸들러 부착 전 발생해 놓칠 수 있다.
  // 마운트 시 img.complete를 확인해 이미 로드됐으면 loaded로 승격(스피너 고착 방지).
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setPhase('loaded');
    }
  }, [src]);
  if (phase === 'failed') {
    return null;
  }
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {phase === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 aria-hidden className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        onLoad={() => setPhase('loaded')}
        onError={() => setPhase('failed')}
        className={`max-h-full max-w-full object-contain transition-opacity duration-200 ease-kiki ${
          phase === 'loaded' ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}

export function AudioReader({
  book,
  bookDetailHref,
  backLabel = '책으로 돌아가기',
}: AudioReaderProps) {
  const { pages, title } = book;
  const total = pages.length;

  const [index, setIndex] = useState(0);
  const [marksByPage, setMarksByPage] = useState<Record<number, WordMark[]>>({});
  const [nowMs, setNowMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  // 자동 넘김으로 페이지가 바뀐 직후 새 오디오를 이어서 재생하기 위한 플래그.
  const autoplayNextRef = useRef(false);
  // 자동 넘김 지연 타이머(P1-C). 수동 조작·언마운트 시 취소한다.
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const page = pages[index];
  const marks = marksByPage[page.pageIndex] ?? [];
  const activeIndex = activeMarkIndex(marks, nowMs);

  // 이미 로드 시도한 페이지(중복 요청 방지). ref라 StrictMode 이중 마운트에도 유지된다.
  const loadedMarksRef = useRef<Set<number>>(new Set());

  // 현재 페이지 marks lazy fetch — 페이지당 1회. AbortController를 쓰지 않는다:
  // dev StrictMode의 cleanup abort가 정적 marks fetch를 취소해 빈 캐시로 굳는 문제를 피한다
  // (marks는 정적 파일이라 중복 요청은 무해, 캐시 히트로 사실상 1회).
  useEffect(() => {
    const target = pages[index];
    if (!target?.marksUrl) return;
    if (loadedMarksRef.current.has(target.pageIndex)) return;
    loadedMarksRef.current.add(target.pageIndex);
    (async () => {
      try {
        const res = await fetch(target.marksUrl!);
        if (!res.ok) throw new Error(`marks ${res.status}`);
        const parsed = parseMarks(await res.text());
        setMarksByPage((prev) => ({ ...prev, [target.pageIndex]: parsed }));
      } catch {
        // 실패해도 재생은 계속(하이라이트만 비활성). 빈 배열로 캐시.
        setMarksByPage((prev) => ({ ...prev, [target.pageIndex]: [] }));
      }
    })();
  }, [index, pages]);

  // rAF로 재생시각 추적 — timeupdate(초당 4회)보다 부드러운 단어 하이라이트.
  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);
  const startRaf = useCallback(() => {
    stopRaf();
    const tick = () => {
      const el = audioRef.current;
      if (el) setNowMs(el.currentTime * 1000);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopRaf]);
  useEffect(() => stopRaf, [stopRaf]);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current !== null) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);
  useEffect(() => clearAdvanceTimer, [clearAdvanceTimer]);

  // 페이지 변경 시 시간 초기화 + (자동 넘김 이어재생이면) 새 오디오 자동 재생.
  useEffect(() => {
    setNowMs(0);
    setDurationMs(0);
    setIsPlaying(false);
    const el = audioRef.current;
    if (el && autoplayNextRef.current && page.audioUrl) {
      autoplayNextRef.current = false;
      el.play().catch(() => {
        // 브라우저 자동재생 정책 등 — 무시(사용자가 재생 버튼으로 이어갈 수 있음).
      });
    } else {
      autoplayNextRef.current = false;
    }
  }, [index, page.audioUrl]);

  // 수동 페이지 이동 시 대기 중인 자동 넘김 타이머를 취소한다.
  const goPrev = useCallback(() => {
    clearAdvanceTimer();
    setIndex((i) => Math.max(0, i - 1));
  }, [clearAdvanceTimer]);
  const goNext = useCallback(() => {
    clearAdvanceTimer();
    setIndex((i) => Math.min(total - 1, i + 1));
  }, [total, clearAdvanceTimer]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el || !page.audioUrl) return;
    clearAdvanceTimer(); // 대기 중 자동 넘김이 있으면 수동 재생/정지가 우선.
    if (el.paused) el.play().catch(() => undefined);
    else el.pause();
  }, [page.audioUrl, clearAdvanceTimer]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    stopRaf();
    const el = audioRef.current;
    if (el) setNowMs(el.duration * 1000 || 0);
    // 자동 넘김: 지연(P1-C) 후 다음 페이지로 넘기고 이어재생 예약(ADR-0052 뷰어 자동 진행).
    if (autoAdvance && index < total - 1) {
      clearAdvanceTimer();
      advanceTimerRef.current = setTimeout(() => {
        autoplayNextRef.current = true;
        goNext();
      }, AUTO_ADVANCE_DELAY_MS);
    }
  }, [autoAdvance, index, total, goNext, stopRaf, clearAdvanceTimer]);

  const progress =
    durationMs > 0 ? Math.min(100, (nowMs / durationMs) * 100) : 0;
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const hasAudio = Boolean(page.audioUrl);

  return (
    <div className="flex h-full w-full flex-col">
      {/* 헤더 — 뒤로가기 · 타이틀 · 페이지 n/total (전체 폭) */}
      <header className="flex shrink-0 items-center gap-3 px-4 py-3 md:px-8">
        <Link
          href={bookDetailHref}
          aria-label={backLabel}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-pill border border-outline bg-surface text-text transition-colors duration-200 ease-kiki hover:bg-surface-2"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-center font-display text-base font-semibold text-text md:text-lg">
          {title}
        </h1>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-text-variant">
          {index + 1} / {total}
        </span>
      </header>

      {/* 본문 — 상하 1단(P1-D). 넓은 화면은 max-w 중앙정렬, 이미지가 세로 높이 최대 활용. */}
      <div className="flex min-h-0 w-full flex-1 flex-col items-center px-4 pb-3 md:px-8">
       <div className="flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-4">
        {/* 이미지(위) — 세로 공간 최대 활용 */}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-surface-3 p-3 shadow-elev-2 md:p-4">
          <PageImage key={page.imageUrl} src={page.imageUrl} alt={`${title} ${page.page}면`} />
        </div>

        {/* 자막·진행바·컨트롤·자동넘김(아래) */}
        <div className="flex shrink-0 flex-col gap-4">
          {/* 자막 — 별도 영역(오버레이 금지), 중앙 정렬, 18px↑. */}
          <div className="min-h-[3rem]">
            {page.text ? (
              <HighlightedText
                text={page.text}
                marks={marks}
                activeIndex={activeIndex}
                unit={HIGHLIGHT_UNIT}
                className="whitespace-pre-wrap text-center font-display text-lg font-semibold leading-loose text-text md:text-xl"
              />
            ) : (
              <p className="text-center text-sm text-text-variant">
                이 페이지는 소리가 없어요.
              </p>
            )}
          </div>

          {/* 진행바 — 4px, primary fill / surface-2 track (§7.2) */}
          <div
            className="h-1 w-full overflow-hidden rounded-pill bg-surface-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <div
              className="h-full rounded-pill bg-primary transition-[width] duration-150 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* 컨트롤 — 이전 · 중앙 원형 재생/일시정지 · 다음 */}
          <div className="flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={goPrev}
              disabled={isFirst}
              aria-label="이전 페이지"
              className="inline-flex h-12 w-12 items-center justify-center rounded-pill border border-outline bg-surface text-text shadow-elev-1 transition-all duration-200 ease-kiki hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-[0.38] disabled:hover:bg-surface"
            >
              <ChevronLeft className="h-6 w-6" aria-hidden />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              disabled={!hasAudio}
              aria-label={isPlaying ? '일시정지' : '재생'}
              className="inline-flex h-16 w-16 items-center justify-center rounded-pill bg-primary text-white shadow-elev-2 transition-all duration-200 ease-kiki hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-[0.38]"
            >
              {isPlaying ? (
                <Pause className="h-7 w-7" aria-hidden />
              ) : (
                <Play className="h-7 w-7 translate-x-[1px]" aria-hidden />
              )}
            </button>

            <button
              type="button"
              onClick={goNext}
              disabled={isLast}
              aria-label="다음 페이지"
              className="inline-flex h-12 w-12 items-center justify-center rounded-pill border border-outline bg-surface text-text shadow-elev-1 transition-all duration-200 ease-kiki hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-[0.38] disabled:hover:bg-surface"
            >
              <ChevronRight className="h-6 w-6" aria-hidden />
            </button>
          </div>

          {/* 자동 넘김 상태 표시 + 토글 */}
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={autoAdvance}
              onClick={() => setAutoAdvance((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors duration-200 ease-kiki ${
                autoAdvance ? 'bg-primary' : 'bg-surface-2'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-pill bg-surface shadow-elev-1 transition-transform duration-200 ease-kiki ${
                  autoAdvance ? 'translate-x-[1.375rem]' : 'translate-x-[0.125rem]'
                }`}
              />
            </button>
            <span className="text-sm text-text-variant">재생 후 자동 넘김</span>
          </div>
        </div>
       </div>
      </div>

      {/* 오디오 — 페이지별 remount(key). 화면엔 커스텀 컨트롤만 노출. */}
      <audio
        ref={audioRef}
        key={page.pageIndex}
        src={page.audioUrl ?? undefined}
        preload="metadata"
        onLoadedMetadata={(e) => setDurationMs(e.currentTarget.duration * 1000 || 0)}
        onPlay={() => {
          setIsPlaying(true);
          startRaf();
        }}
        onPause={() => {
          setIsPlaying(false);
          stopRaf();
        }}
        onEnded={handleEnded}
      />
    </div>
  );
}
