'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { HighlightedText, type WordMark } from '@/components/book/highlighted-text';
import {
  AUTO_ADVANCE_DELAY_MS,
  HIGHLIGHT_UNIT,
  SILENT_PAGE_ADVANCE_MS,
} from '@/lib/book/highlight-config';
import type { ReaderAudioBook } from '@/lib/book/audio-manifest';
import { startReadingSession } from '@/lib/book/reading-session';

/**
 * AudioReader — book_dash 시범 12권용 자체 오디오 리더 (ADR-0052 Phase D).
 *
 * 표지(kind='cover') + 이미지 + 자막 + TTS 재생/일시정지 + 단어 하이라이트 + 자동 페이지 넘김.
 * 레이아웃은 **한 컴포넌트 내 반응형 분기**(팀장 확정, MobileReader/DesktopReader 분리 금지).
 * 세로 1단 고정이며 스크롤 없는 한 화면을 유지한다(P1-D·P2-B·P2-C):
 *   헤더 1행(뒤로가기·제목·위치) → 이미지 행 → 자막 → 하단 1행(자동넘김·재생·완독).
 *   - 이동 버튼: lg↑는 이미지 좌우, lg 미만은 이미지 위 반투명 오버레이
 *     (좁은 폭에서 사이드 버튼이 이미지 폭을 잠식하기 때문 — 실측 근거).
 *   - 자막이 길면 이미지가 먼저 줄어 스크롤을 막는다(이미지 행 flex-1 + min-h-0).
 *
 * 하이라이트: HighlightedText가 담당. 단위 전환은 HIGHLIGHT_UNIT 한 곳(ADR-0052 D7).
 * 색·반경은 Tailwind semantic 토큰만(Hard Rule 10). AsbReader PageImage 패턴 정합.
 *
 * 어트리뷰션 바는 본 컴포넌트 밖(page.tsx 레벨)에 둔다(AsbReader 책임 경계 정합).
 *
 * 오디오/marks URL은 audio-manifest가 book_audio 행(업로드된 오브젝트 키) 기준으로 조립해 넘긴다.
 */

interface AudioReaderProps {
  book: ReaderAudioBook;
  /** 뒤로가기 대상(책 상세). */
  bookDetailHref: string;
  /** 뒤로가기 라벨. */
  backLabel?: string;
  /**
   * 자동 넘김 토글 라벨(Wave 1 F4). 좁은 화면에서도 상시 노출한다.
   * server-only lib/book/copy.ts의 audioReader.autoAdvanceLabel을 page.tsx가 주입한다
   * (클라이언트 컴포넌트가 copy를 직접 import할 수 없으므로 props threading).
   */
  autoAdvanceLabel?: string;
  /**
   * 하단 1행 오른쪽에 놓을 완독 버튼(P2-B). page.tsx가 FinishButton을 주입한다.
   * 슬롯으로 받는 이유: FinishButton은 HtmlReader·AsbReader와 공유하는 컴포넌트라
   * 여기서 import·재구성하면 그쪽 레이아웃까지 영향을 받는다. 무수정 주입이 안전하다.
   */
  finishSlot?: ReactNode;
}

/**
 * 페이지 이동 버튼 — 데스크탑은 이미지 양옆, 모바일은 이미지 위 반투명 오버레이(overlay).
 * 터치 타깃은 아동 사용자를 위해 두 형태 모두 44px 이상(h-11/h-12)을 유지한다.
 */
function NavButton({
  direction,
  onClick,
  disabled,
  overlay = false,
  className = '',
}: {
  direction: 'prev' | 'next';
  onClick: () => void;
  disabled: boolean;
  overlay?: boolean;
  className?: string;
}) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
  const base =
    'items-center justify-center rounded-pill transition-all duration-200 ease-kiki disabled:cursor-not-allowed disabled:opacity-[0.38]';
  const skin = overlay
    ? 'inline-flex h-11 w-11 bg-surface/80 text-text shadow-elev-2 backdrop-blur-sm hover:bg-surface'
    : 'h-12 w-12 shrink-0 border border-outline bg-surface text-text shadow-elev-1 hover:bg-surface-2 disabled:hover:bg-surface';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'prev' ? '이전 페이지' : '다음 페이지'}
      className={`${base} ${skin} ${className}`}
    >
      <Icon className="h-6 w-6" aria-hidden />
    </button>
  );
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

/** 표지·본문을 한 축으로 다루는 슬라이드. key는 marks 캐시·audio remount 식별자. */
interface Slide {
  key: string;
  imageUrl: string;
  imageAlt: string;
  /** 화면 우상단 위치 표시. 표지는 '표지', 본문은 'n / total'. */
  positionLabel: string;
  text: string;
  audioUrl: string | null;
  marksUrl: string | null;
}

export function AudioReader({
  book,
  bookDetailHref,
  backLabel = '책으로 돌아가기',
  autoAdvanceLabel = '자동 넘김',
  finishSlot,
}: AudioReaderProps) {
  const { bookId, cover, pages, title } = book;

  // 표지가 있으면 맨 앞에 붙인다(ADR-0034 Amd#1). 없으면 본문부터 — 기존 동작 그대로(회귀 0).
  const slides: Slide[] = [
    ...(cover
      ? [
          {
            key: 'cover',
            imageUrl: cover.imageUrl,
            imageAlt: `${title} 표지`,
            positionLabel: '표지',
            text: cover.text,
            audioUrl: cover.audioUrl,
            marksUrl: cover.marksUrl,
          },
        ]
      : []),
    ...pages.map((p) => ({
      key: `p${p.pageIndex}`,
      imageUrl: p.imageUrl,
      imageAlt: `${title} ${p.page}면`,
      positionLabel: `${p.page} / ${pages.length}`,
      text: p.text,
      audioUrl: p.audioUrl,
      marksUrl: p.marksUrl,
    })),
  ];
  const total = slides.length;

  const [index, setIndex] = useState(0);
  const [marksByPage, setMarksByPage] = useState<Record<string, WordMark[]>>({});
  const [nowMs, setNowMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  // 현재 슬라이드 오디오가 끝까지 재생됐는지(F2 다시듣기). 재생 시작·페이지 이동 시 해제.
  // true면 중앙 버튼이 ▶ 대신 ↻(다시듣기)로 바뀌고 클릭 시 처음부터 재생한다.
  const [ended, setEnded] = useState(false);
  // 완독 버튼 게이트(P2-C) — 마지막 슬라이드에 **한 번이라도 도달**하면 true로 굳는다.
  // 이후 앞 페이지로 되돌아가도 유지된다(다시 잠그지 않는다).
  const [reachedEnd, setReachedEnd] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  // 자동 넘김으로 페이지가 바뀐 직후 새 오디오를 이어서 재생하기 위한 플래그.
  const autoplayNextRef = useRef(false);
  // 재생 세션 진행 중 여부(F5-b) — onPlay에서 true, 사용자 일시정지(onPause)에서 false.
  // 자연 종료(onEnded)는 pause 이벤트를 내지 않아 세션이 유지되고, 무음 페이지를 지나도
  // (상태가 아니라 ref라) 값이 보존된다. goNext가 이 값을 보고 다음 장 이어재생을 예약한다.
  const playSessionRef = useRef(false);
  // 자동 넘김 지연 타이머(P1-C). 수동 조작·언마운트 시 취소한다.
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const page = slides[index];
  const marks = marksByPage[page.key] ?? [];
  const activeIndex = activeMarkIndex(marks, nowMs);

  // 세션 시작 — 마운트 1회(HtmlReader·AsbReader와 동일, intent §5.1). 실패는 silent.
  // ★ 이 호출이 없으면 FinishButton의 completeReadingSession이 미완료 세션을 못 찾아
  //   '완독할 세션을 찾을 수 없습니다.'로 실패한다(reading-session.ts:189 0행 분기).
  useEffect(() => {
    startReadingSession(bookId).catch(() => {
      // 네트워크 오류 등 — 의도적 silent fail.
    });
  }, [bookId]);

  // 이미 로드 시도한 슬라이드(중복 요청 방지). ref라 StrictMode 이중 마운트에도 유지된다.
  const loadedMarksRef = useRef<Set<string>>(new Set());

  // 현재 페이지 marks lazy fetch — 페이지당 1회. AbortController를 쓰지 않는다:
  // dev StrictMode의 cleanup abort가 정적 marks fetch를 취소해 빈 캐시로 굳는 문제를 피한다
  // (marks는 정적 파일이라 중복 요청은 무해, 캐시 히트로 사실상 1회).
  // deps는 slides 배열(매 렌더 새 참조)이 아니라 현재 슬라이드의 문자열 키·URL로 둔다.
  useEffect(() => {
    const key = page.key;
    const url = page.marksUrl;
    if (!url) return;
    if (loadedMarksRef.current.has(key)) return;
    loadedMarksRef.current.add(key);
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`marks ${res.status}`);
        const parsed = parseMarks(await res.text());
        setMarksByPage((prev) => ({ ...prev, [key]: parsed }));
      } catch {
        // 실패해도 재생은 계속(하이라이트만 비활성). 빈 배열로 캐시.
        setMarksByPage((prev) => ({ ...prev, [key]: [] }));
      }
    })();
  }, [page.key, page.marksUrl]);

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
    setIsPlaying(false);
    setEnded(false); // 새 슬라이드에서는 다시듣기 상태 해제(F2).
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
    // 재생 세션 진행 중이면 다음 장 이어재생을 예약한다(F5-b). 사용자가 일시정지한
    // 상태(playSessionRef=false)에서 수동으로 넘기면 예약하지 않아 정지 상태가 유지된다.
    // 무음 페이지의 F5-a 타이머가 goNext를 호출할 때도 이 경로로 이어재생이 연결된다.
    if (playSessionRef.current) autoplayNextRef.current = true;
    setIndex((i) => Math.min(total - 1, i + 1));
  }, [total, clearAdvanceTimer]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el || !page.audioUrl) return;
    clearAdvanceTimer(); // 대기 중 자동 넘김이 있으면 수동 재생/정지가 우선.
    if (el.paused) {
      // 다시듣기(F2): 끝까지 들은 뒤 재생하면 처음부터. onPlay가 ended를 해제한다.
      if (ended) el.currentTime = 0;
      el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, [page.audioUrl, clearAdvanceTimer, ended]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setEnded(true); // 다시듣기 버튼 노출 조건(F2).
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

  const isFirst = index === 0;
  const isLast = index === total - 1;
  const hasAudio = Boolean(page.audioUrl);
  // 표지 시작 유도 오버레이(F3): 표지 슬라이드에서 아직 재생 전(nowMs 0·정지)일 때만.
  // 한 번 재생되면 nowMs>0 으로 굳어 되돌아와도 다시 뜨지 않는다(표지 재진입 제외).
  const showCoverStart =
    page.key === 'cover' && hasAudio && !isPlaying && nowMs === 0;

  // 마지막 슬라이드 도달 이력 기록. 단방향(false→true)이라 되돌아가도 풀리지 않는다.
  useEffect(() => {
    if (isLast) setReachedEnd(true);
  }, [isLast]);

  // 소리 없는 페이지 자동 넘김(F5-a) — 오디오가 없으면 onEnded가 없어 handleEnded의
  // 자동 넘김 경로가 걸리지 않는다. 자동 넘김 ON + 오디오 없음 + 마지막 장 아님이면
  // SILENT_PAGE_ADVANCE_MS 후 다음 장으로 넘긴다. deps에 index를 포함해 무음 페이지가
  // 연속돼도 페이지마다 타이머를 새로 건다. 이탈·토글 변경 시 cleanup으로 반드시 해제해
  // 중복 전환을 막는다. goNext가 재생 세션 여부를 보고 이어재생을 잇는다(F5-b 연결).
  useEffect(() => {
    if (!autoAdvance || hasAudio || isLast) return;
    clearAdvanceTimer();
    advanceTimerRef.current = setTimeout(() => {
      goNext();
    }, SILENT_PAGE_ADVANCE_MS);
    return clearAdvanceTimer;
  }, [index, autoAdvance, hasAudio, isLast, goNext, clearAdvanceTimer]);

  return (
    <div className="flex h-full w-full flex-col">
      {/* 헤더 1행 — 뒤로가기 · 타이틀 · 위치. 상하 여백 최소화(P2-B): 이미지·자막에 세로 양보. */}
      <header className="flex shrink-0 items-center gap-3 px-3 py-1.5 md:px-6">
        <Link
          href={bookDetailHref}
          aria-label={backLabel}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-pill border border-outline bg-surface text-text transition-colors duration-200 ease-kiki hover:bg-surface-2"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        {/* 제목 서체 = font-body(고딕). 자막과 통일(P2-C). 세리프(font-display) 복귀 가능. */}
        <h1 className="min-w-0 flex-1 truncate text-center font-body text-base font-semibold text-text md:text-lg">
          {title}
        </h1>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-text-variant">
          {page.positionLabel}
        </span>
      </header>

      {/* 본문 — 상하 1단(P1-D) + P2-B 재배치.
          이미지 행이 flex-1로 남는 세로를 전부 흡수하고, 자막·컨트롤은 내용만큼만 차지한다.
          좌우 이동 버튼은 이미지 옆(md↑)·이미지 위 오버레이(모바일)로 옮겨 하단 1행을 비웠다. */}
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 px-2 pb-2 md:gap-3 md:px-4">
        {/* 이미지 행 — [◀] 이미지 [▶]. 바탕 카드 없음(P2-A), 비율 보존은 PageImage 담당. */}
        <div className="flex min-h-0 w-full flex-1 items-center justify-center gap-1 md:gap-3">
          <NavButton
            direction="prev"
            onClick={goPrev}
            disabled={isFirst}
            className="hidden lg:inline-flex"
          />
          <div className="relative flex h-full min-h-0 flex-1 items-center justify-center overflow-hidden">
            <PageImage key={page.imageUrl} src={page.imageUrl} alt={page.imageAlt} />
            {/* 모바일·태블릿(<lg) — 좌우 버튼이 이미지 폭을 잠식하므로 이미지 위 오버레이로 둔다. */}
            <NavButton
              direction="prev"
              onClick={goPrev}
              disabled={isFirst}
              overlay
              className="absolute left-1 top-1/2 -translate-y-1/2 lg:hidden"
            />
            <NavButton
              direction="next"
              onClick={goNext}
              disabled={isLast}
              overlay
              className="absolute right-1 top-1/2 -translate-y-1/2 lg:hidden"
            />
            {/* 표지 시작 유도(F3) — 이미지 전체가 탭 타깃, 중앙에 시작 필.
                색 투명도 모디파이어 대신 backdrop-blur-sm로 오버레이 질감을 주고
                커버 이미지는 가리지 않는다(Tailwind v3 hex 토큰 투명도 렌더 회피).
                재생 시작(isPlaying) 또는 nowMs 진행 시 showCoverStart=false로 사라진다. */}
            {showCoverStart && (
              <button
                type="button"
                onClick={togglePlay}
                aria-label="눌러서 시작하기"
                className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm transition-opacity duration-200 ease-kiki"
              >
                <span className="inline-flex items-center gap-2 rounded-pill bg-primary px-6 py-3 font-body text-lg font-semibold text-white shadow-elev-2">
                  <Play className="h-6 w-6 translate-x-[1px]" aria-hidden />
                  눌러서 시작하기
                </span>
              </button>
            )}
          </div>
          <NavButton
            direction="next"
            onClick={goNext}
            disabled={isLast}
            className="hidden lg:inline-flex"
          />
        </div>

        {/* 자막 — 확대(P2-B) 후 P2-C에서 문장 간격 확보: 크기 한 단계 축소 + 행간 loose(2.0).
            한 줄이 너무 길지 않도록 max-w-4xl 상한 유지. */}
        <div className="flex w-full max-w-4xl shrink-0 items-center justify-center">
          {page.text ? (
            <HighlightedText
              text={page.text}
              marks={marks}
              activeIndex={activeIndex}
              unit={HIGHLIGHT_UNIT}
              // lg:text-3xl은 자체 line-height를 함께 지정하므로 lg:leading-loose를 반드시 동반한다
              // (없으면 lg 구간 행간이 1.2로 되돌아간다 — 실측 확인).
              className="whitespace-pre-wrap text-center font-body text-2xl font-semibold leading-loose text-text lg:text-3xl lg:leading-loose"
            />
          ) : (
            <p className="text-center text-sm text-text-variant">
              이 페이지는 소리가 없어요.
            </p>
          )}
        </div>

        {/* 하단 1행 — 자동넘김(좌) · 재생(중앙, 주 동작) · 완독(우).
            grid 3열(1fr auto 1fr)이라 좌우 폭이 달라도 재생 버튼이 화면 중앙에 고정된다. */}
        <div className="grid w-full max-w-4xl shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex items-center justify-start gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={autoAdvance}
              aria-label="재생 후 자동 넘김"
              onClick={() => setAutoAdvance((v) => !v)}
              // off 상태 시인성(P2-C): 흰 배경에 묻히지 않도록 테두리를 준다.
              // outline(#E8E2D9)은 흰 배경에서 너무 옅어, muted 토큰 text-disabled
              // (38% 블랙 ≈ gray-400)를 테두리색으로 쓴다. raw 값 0건(Hard Rule 10).
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill border transition-colors duration-200 ease-kiki ${
                autoAdvance
                  ? 'border-transparent bg-primary'
                  : 'border-text-disabled bg-surface-2'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-pill bg-surface shadow-elev-1 transition-transform duration-200 ease-kiki ${
                  autoAdvance ? 'translate-x-[1.375rem]' : 'translate-x-[0.125rem]'
                }`}
              />
            </button>
            {/* 토글 라벨 상시 노출(F4) — 무엇을 켜고 끄는지 좁은 화면에서도 보이게 한다.
                무스크롤 단일행 유지를 위해 문구를 축약('자동 넘김', copy.ts 편입)하고
                줄바꿈을 막는다(whitespace-nowrap). truncate 대신 nowrap: 4글자 축약이라
                가로 폭을 거의 먹지 않고, 잘림 없이 온전히 보이는 편이 P1·P3에 유리. */}
            <span className="whitespace-nowrap text-sm text-text-variant">
              {autoAdvanceLabel}
            </span>
          </div>

          {/* 중앙 주 동작 버튼. 재생 완료(ended) 후에는 ▶ 대신 ↻(다시듣기, F2)로 바뀌고
              클릭 시 togglePlay가 currentTime=0으로 되감아 처음부터 재생한다. */}
          <button
            type="button"
            onClick={togglePlay}
            disabled={!hasAudio}
            aria-label={isPlaying ? '일시정지' : ended ? '다시 듣기' : '재생'}
            className="inline-flex h-16 w-16 items-center justify-center rounded-pill bg-primary text-white shadow-elev-2 transition-all duration-200 ease-kiki hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-[0.38]"
          >
            {isPlaying ? (
              <Pause className="h-7 w-7" aria-hidden />
            ) : ended ? (
              <RotateCcw className="h-7 w-7" aria-hidden />
            ) : (
              <Play className="h-7 w-7 translate-x-[1px]" aria-hidden />
            )}
          </button>

          {/* 완독 버튼 슬롯 — page.tsx가 FinishButton을 주입한다(컴포넌트 무수정).
              마지막 슬라이드 도달 전에는 래퍼에서 비활성화한다(P2-C):
              grayscale로 primary 주황을 회색으로 낮추고, pointer-events-none으로 클릭을 막는다.
              FinishButton은 HtmlReader·AsbReader와 공유하므로 시그니처·스타일을 건드리지 않는다. */}
          <div
            className={`flex items-center justify-end ${
              reachedEnd ? '' : 'cursor-not-allowed'
            }`}
            aria-disabled={!reachedEnd}
            title={reachedEnd ? undefined : '마지막 장까지 보면 완독할 수 있어요'}
          >
            <div
              className={
                reachedEnd
                  ? ''
                  : 'pointer-events-none opacity-[0.55] grayscale [&_*]:shadow-none'
              }
            >
              {finishSlot}
            </div>
          </div>
        </div>

        {/* 완독 조건 안내(F1) — 왜 완독 버튼이 회색인지 알린다(P1).
            게이트가 잠긴 동안(!reachedEnd)만 렌더하고, 마지막 장 도달로 풀리면
            숨겨 세로 공간을 회수한다(무스크롤 단일화면 유지). 완독 버튼 쪽에
            붙도록 우측 정렬. title= 툴팁은 hover 없는 터치기기에서 안 보여 보조일 뿐. */}
        {!reachedEnd && (
          <p className="w-full max-w-4xl shrink-0 text-right text-xs text-text-variant">
            끝까지 들으면 완독 버튼이 켜져요
          </p>
        )}
      </div>

      {/* 오디오 — 페이지별 remount(key). 화면엔 커스텀 컨트롤만 노출. */}
      <audio
        ref={audioRef}
        key={page.key}
        src={page.audioUrl ?? undefined}
        preload="metadata"
        onPlay={() => {
          setIsPlaying(true);
          setEnded(false); // 재생 시작 시 다시듣기 상태 해제(F2).
          playSessionRef.current = true; // 재생 세션 시작(F5-b).
          startRaf();
        }}
        onPause={() => {
          setIsPlaying(false);
          // 사용자 일시정지 = 세션 종료(F5-b). 자연 종료(onEnded)는 pause를 내지 않아
          // 여기 오지 않으므로 자동 넘김 이어재생 세션은 유지된다.
          playSessionRef.current = false;
          stopRaf();
        }}
        onEnded={handleEnded}
      />
    </div>
  );
}
