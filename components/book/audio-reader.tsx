'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react';

import { HighlightedText, type WordMark } from '@/components/book/highlighted-text';
import type { AttributionRow } from '@/lib/book/attribution';
import {
  AUTO_ADVANCE_DELAY_MS,
  HIGHLIGHT_UNIT,
  PAGE_TURN_MS,
  PAGE_TURN_SOUND_URL,
  PAGE_TURN_SOUND_VOLUME,
  SILENT_PAGE_ADVANCE_MS,
  SWIPE_MIN_PX,
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
   * 어트리뷰션 행(Wave 1.7 F7). 상단 어트리뷰션 바 제거 대신 헤더 ⓘ 팝오버로 노출한다.
   * page.tsx가 buildAttributionRows 결과(작가/출판사·illustrator·license·원본)를 내려준다.
   * CC BY 필수 4요소 중 책 제목은 book.title로 별도 노출. 비면 ⓘ를 표시하지 않는다.
   */
  attributionRows?: AttributionRow[];
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

/**
 * TurningPage — 책넘김 3D 컬 연출(리더 폴리시 Task 2).
 *
 * ★ 시각 레이어 전용이다. 오디오·하이라이트·index 전환 로직과 접점이 0건이다:
 *   부모가 이 래퍼를 슬라이드 key로 remount하면, 새 면이 비스듬히 누운 자세에서
 *   평평하게 안착하는 enter 애니메이션만 돈다. 전환 '완료 시점'을 바꾸지 않으므로
 *   연속 듣기·자동 재생 타이밍은 그대로다(기존 페이지 진입 effect가 즉시 실행됨).
 *
 * 구현: keyframes·tailwind.config 무변경(celebrate-rewards.tsx의 "transition만으로"
 *   원칙 계승). 마운트 직후 초기 transform(회전+기울임)을 리플로우로 굳힌 뒤 다음
 *   프레임에 identity로 transition을 건다 — 순수 enter 트랜지션.
 *
 * 방향: next=오른쪽→왼쪽 넘김(왼쪽 모서리를 경첩으로 오른쪽이 내려앉음),
 *       prev=왼쪽→오른쪽 넘김(오른쪽 모서리 경첩). direction으로 경첩·회전 부호를 뒤집는다.
 *
 * 접근성: prefers-reduced-motion이면 transform을 아예 걸지 않아 즉시 전환된다
 *   (초기 회전 자세도 건너뛴다 — motion-reduce 유틸만으로는 '회전 후 점프'가 남으므로
 *    matchMedia로 초기 자세 자체를 생략한다).
 */
function TurningPage({
  direction,
  reduceMotion,
  children,
}: {
  direction: 'next' | 'prev';
  reduceMotion: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduceMotion) return; // 감속 모드: 초기 자세 없이 즉시 평면.
    // next는 왼쪽 경첩(오른쪽 모서리가 들렸다 내려옴), prev는 오른쪽 경첩.
    const hinge = direction === 'next' ? 'left center' : 'right center';
    const startRotate = direction === 'next' ? 32 : -32; // deg
    el.style.transformOrigin = hinge;
    el.style.transition = 'none';
    el.style.transform = `perspective(1200px) rotateY(${startRotate}deg)`;
    el.style.opacity = '0.5';
    // 초기 자세를 강제로 커밋(리플로우) — 없으면 브라우저가 두 스타일을 합쳐 애니메이션이 생략된다.
    void el.offsetWidth;
    el.style.transition = `transform ${PAGE_TURN_MS}ms cubic-bezier(0.2, 0, 0, 1), opacity ${PAGE_TURN_MS}ms ease-out`;
    el.style.transform = 'perspective(1200px) rotateY(0deg)';
    el.style.opacity = '1';
  }, [direction, reduceMotion]);
  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center will-change-transform">
      {children}
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
  attributionRows = [],
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
  // index 동기 미러 — goPrev/goNext가 경계를 렌더 사이에도 정확히 판정하게 한다.
  const indexRef = useRef(0);
  indexRef.current = index;
  const [marksByPage, setMarksByPage] = useState<Record<string, WordMark[]>>({});
  const [nowMs, setNowMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  // 현재 슬라이드 오디오가 끝까지 재생됐는지(F2 다시듣기). 재생 시작·페이지 이동 시 해제.
  // true면 중앙 버튼이 ▶ 대신 ↻(다시듣기)로 바뀌고 클릭 시 처음부터 재생한다.
  const [ended, setEnded] = useState(false);
  // 무음면 카운트다운 남은 초(Wave 1.6 F6). null이면 미표시(토글 OFF·오디오 면·마지막 면).
  const [silentCountdown, setSilentCountdown] = useState<number | null>(null);
  // 어트리뷰션 팝오버 표시 여부(Wave 1.7 F7). 헤더 ⓘ로 열고 배경/✕/Esc로 닫는다.
  const [showAttribution, setShowAttribution] = useState(false);
  // 자막 표시 여부(Wave 2 F6 "그림만 크게 보고 싶다"). 기본 표시.
  //   ★ 렌더 전용 스위치다 — marks fetch·rAF 시각 추적·activeIndex 계산은 그대로 돈다.
  //     따라서 숨긴 채 듣다가 다시 켜도 하이라이트가 현재 재생 위치에 붙어 있다.
  //   ★ 상태를 이 컴포넌트에 두므로 페이지를 넘겨도(index만 변경) 유지되고, 리더를
  //     벗어나면 사라진다. localStorage 등 영속화는 하지 않는다(작업 범위 밖).
  const [showSubtitle, setShowSubtitle] = useState(true);
  // 완독 버튼 게이트(P2-C) — 마지막 슬라이드에 **한 번이라도 도달**하면 true로 굳는다.
  // 이후 앞 페이지로 되돌아가도 유지된다(다시 잠그지 않는다).
  const [reachedEnd, setReachedEnd] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  // 사용자가 리더와 한 번이라도 상호작용(재생 탭·수동 이동)했는지(Wave 1.6). 표지 첫
  // 진입 등 상호작용 전에는 자동 재생을 시도하지 않는다 — 브라우저 자동재생 정책을
  // 존중하고 F3 표지 오버레이를 유지한다. 이후 진입은 연속 듣기 모드 규칙을 따른다.
  const interactedRef = useRef(false);
  // 페이지 진입 effect가 최신 토글값을 deps 없이 읽기 위한 미러(Wave 1.6). autoAdvance를
  // 그 effect의 deps에 넣으면 토글만 바꿔도 재생 상태가 리셋되므로 ref로 우회한다.
  const autoAdvanceRef = useRef(autoAdvance);
  autoAdvanceRef.current = autoAdvance;
  // 자동 넘김 지연 타이머(P1-C). 수동 조작·언마운트 시 취소한다.
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 책넘김 연출(리더 폴리시 Task 2·3) ──────────────────────────────────────
  // 넘김 방향 — TurningPage가 enter 애니메이션 방향을 이 값으로 정한다. 표지 첫 렌더는
  // 애니메이션 대상이 아니므로 초기값('next')은 의미가 없다. goPrev/goNext가 갱신한다.
  const [turnDir, setTurnDir] = useState<'next' | 'prev'>('next');
  // 전환 중 사용자 입력 잠금(연타로 두 장이 한꺼번에 넘어가는 것 방지). 자동 넘김·무음면
  // 넘김은 잠금 대상이 아니다 — 연속 듣기 흐름이 잠금에 걸려 멈추면 안 되기 때문.
  const isTurningRef = useRef(false);
  // prefers-reduced-motion — 마운트 시 1회 확정. 감속 모드면 애니메이션·입력잠금을 생략한다.
  const reduceMotionRef = useRef(false);
  // 책넘김 효과음(Task 3) — 음원 미확보(PAGE_TURN_SOUND_URL=null)라 현재 재생 0건.
  // 자산이 확보돼 URL이 채워지면 이 ref에 Audio가 만들어져 페이지 전환마다 1회 재생된다.
  const turnSoundRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    reduceMotionRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    // 효과음 preload — URL이 있을 때만. 낭독을 덮지 않도록 음량을 낮춰 둔다(-12dB 수준).
    if (PAGE_TURN_SOUND_URL) {
      const el = new Audio(PAGE_TURN_SOUND_URL);
      el.volume = PAGE_TURN_SOUND_VOLUME;
      el.preload = 'auto';
      turnSoundRef.current = el;
    }
  }, []);

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

  // 페이지 진입 시 시간·상태 초기화 + 연속 듣기 모드면 자동 재생(Wave 1.6).
  // 어느 경로로 왔든(자동 전환·수동 다음·수동 이전) 토글 ON + 오디오 있음 + 사용자가
  // 이미 상호작용했으면 재생한다(토글 상태가 곧 모드 — 세션 플래그 제거). 표지 첫 진입
  // (상호작용 전)은 시도하지 않는다. autoAdvance는 미러 ref로 읽어 deps에서 빼, 토글만
  // 바꿔도 이 effect가 재실행돼 재생 상태가 리셋되는 것을 막는다.
  useEffect(() => {
    setNowMs(0);
    setIsPlaying(false);
    setEnded(false); // 새 슬라이드에서는 다시듣기 상태 해제(F2).
    const el = audioRef.current;
    if (el && autoAdvanceRef.current && page.audioUrl && interactedRef.current) {
      el.play().catch((err) => {
        // 브라우저 자동재생 정책 등 — 조용히 ▶ 대기 폴백(화면 유지), 콘솔 로그만.
        console.log('[audio-reader] 자동 재생 실패 — 수동 대기로 폴백', err);
      });
    }
  }, [index, page.audioUrl]);

  // 페이지 이동 — 대기 중인 자동 넘김 타이머를 취소한다. 이동으로 상호작용 플래그를
  // 세우고, 새 페이지의 자동 재생 여부는 진입 effect가 토글(연속 듣기 모드) 기준으로
  // 결정한다(Wave 1.6 — 세션 플래그 제거). 일시정지 상태에서 넘겨도 새 장은 모드 규칙대로.
  // 전환 잠금 해제 타이머 — 언마운트·연속 전환 시 갱신한다.
  const turnLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (turnLockTimerRef.current) clearTimeout(turnLockTimerRef.current);
    },
    [],
  );

  // 넘김 부수효과(방향 반영 + 효과음 + 입력잠금) — index 전환 '직전'에만 부른다.
  // 실제 경계에서 막혀 index가 안 바뀌는 경우(첫/마지막 면)에는 부르지 않는다(아래 호출부에서 가드).
  const beginTurn = useCallback((dir: 'next' | 'prev') => {
    setTurnDir(dir);
    // 효과음 1회 재생(URL 확보 시에만 동작 — 현재 자산 미확보로 no-op). 낭독과 겹쳐도
    // 음량이 낮아 방해하지 않는다. 되감아 연타 전환에도 매번 처음부터 짧게 난다.
    const s = turnSoundRef.current;
    if (s) {
      s.currentTime = 0;
      s.play().catch(() => undefined); // 자동재생 정책 등 — 조용히 무시(넘김 자체엔 무영향).
    }
    // 감속 모드는 애니메이션이 없어 잠글 이유도 없다(즉시 다음 입력 수용).
    if (reduceMotionRef.current) return;
    isTurningRef.current = true;
    if (turnLockTimerRef.current) clearTimeout(turnLockTimerRef.current);
    turnLockTimerRef.current = setTimeout(() => {
      isTurningRef.current = false;
    }, PAGE_TURN_MS);
  }, []);

  const goPrev = useCallback(() => {
    interactedRef.current = true;
    clearAdvanceTimer();
    // 경계에서 막히면 넘김 연출도 생략한다. index 미러 ref로 동기 판정 —
    // 부수효과(beginTurn)를 setIndex 업데이터 밖에 둬 StrictMode 이중 호출을 피한다.
    if (indexRef.current <= 0) return;
    beginTurn('prev');
    setIndex((i) => Math.max(0, i - 1));
  }, [clearAdvanceTimer, beginTurn]);
  const goNext = useCallback(() => {
    interactedRef.current = true;
    clearAdvanceTimer();
    if (indexRef.current >= total - 1) return;
    beginTurn('next');
    setIndex((i) => Math.min(total - 1, i + 1));
  }, [total, clearAdvanceTimer, beginTurn]);

  // 사용자 입력(버튼·스와이프) 전용 가드 — 전환 애니메이션 도중의 연타를 무시한다.
  // 자동 넘김·무음면 넘김은 goPrev/goNext를 직접 불러 이 가드를 거치지 않는다(흐름 유지).
  const userPrev = useCallback(() => {
    if (isTurningRef.current) return;
    goPrev();
  }, [goPrev]);
  const userNext = useCallback(() => {
    if (isTurningRef.current) return;
    goNext();
  }, [goNext]);

  // 스와이프 넘김(Wave 2 F7) — 아이는 버튼을 찾기 전에 화면을 민다(intent F7).
  //   ★ 판정은 touchend 한 번뿐이고, 통과하면 기존 goPrev/goNext를 그대로 호출한다.
  //     따라서 상호작용 플래그·자동 넘김 타이머 취소·연속 듣기 재생 규칙이 버튼 조작과
  //     100% 동일하게 적용된다(오디오 로직 무수정 — 새 경로를 만들지 않는 것이 요점).
  //   ★ 오인식 방지: 가로 이동이 SWIPE_MIN_PX 이상이고 세로 이동보다 클 때만 넘긴다.
  //     탭(이동≈0)·세로 제스처는 통과하지 못한다. preventDefault는 쓰지 않아 브라우저
  //     기본 동작(표지 시작 버튼 탭 등)을 막지 않는다.
  //   ★ 마우스는 대상이 아니다(터치 전용). 데스크탑은 좌우 버튼이 그대로 주 수단이다.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: ReactTouchEvent) => {
    const t = e.touches[0];
    // 멀티터치(핀치 등)는 페이지 넘김 의도가 아니다 — 판정 대상에서 뺀다.
    touchStartRef.current =
      e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
  }, []);

  const handleTouchEnd = useCallback(
    (e: ReactTouchEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      const t = e.changedTouches[0];
      if (!start || !t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return;
      // 좌로 밀면 다음 장, 우로 밀면 이전 장(책장을 넘기는 방향과 같다).
      // 양 끝에서는 goPrev/goNext의 clamp가 그대로 막아 준다(별도 경계 처리 0건).
      // userPrev/userNext 경유 — 넘김 애니메이션 도중의 연속 스와이프는 무시된다.
      if (dx < 0) userNext();
      else userPrev();
    },
    [userNext, userPrev],
  );

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el || !page.audioUrl) return;
    interactedRef.current = true; // 사용자 재생/정지 탭 = 상호작용(Wave 1.6).
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
    // 연속 듣기 모드면 여운(P1-C) 후 다음 장으로. 다음 장의 자동 재생은 페이지 진입
    // effect가 토글 기준으로 처리한다(자연 종료는 일시정지가 아니라 흐름 지속 — Wave 1.6).
    if (autoAdvance && index < total - 1) {
      clearAdvanceTimer();
      advanceTimerRef.current = setTimeout(() => {
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

  // 무음면 자동 넘김 + 카운트다운(Wave 1.6 F5-a·F6) — 오디오가 없으면 onEnded가 없어
  // handleEnded 경로가 안 걸린다. 연속 듣기 모드(토글 ON) + 오디오 없음 + 마지막 장 아님
  // 이면 1초 간격으로 N→…→1을 표시하며 SILENT_PAGE_ADVANCE_MS 후 다음 장으로 넘긴다.
  // 다음 장의 자동 재생은 페이지 진입 effect가 처리한다. deps에 index 포함 — 무음면이
  // 연속돼도 면마다 새로 센다. 수동 이동·토글 OFF·마지막 면 진입 시 cleanup으로 타이머·
  // 표시를 즉시 해제한다(중복 전환·잔상 방지). 마지막 면 무음은 넘어갈 곳이 없어 미표시.
  useEffect(() => {
    if (!autoAdvance || hasAudio || isLast) {
      setSilentCountdown(null);
      return;
    }
    let remaining = Math.ceil(SILENT_PAGE_ADVANCE_MS / 1000);
    setSilentCountdown(remaining);
    const id = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(id);
        setSilentCountdown(null);
        goNext();
      } else {
        setSilentCountdown(remaining);
      }
    }, 1000);
    return () => {
      clearInterval(id);
      setSilentCountdown(null);
    };
  }, [index, autoAdvance, hasAudio, isLast, goNext]);

  // 어트리뷰션 팝오버 Esc 닫기(F7 접근성). 열려 있을 때만 리스너를 건다.
  useEffect(() => {
    if (!showAttribution) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAttribution(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAttribution]);

  return (
    <div className="flex h-full w-full flex-col">
      {/* 헤더 1행 — 뒤로가기 · 타이틀 · ⓘ 저작권(Wave 1.7 F7). 위치 표시(F9)는 이미지
          우하단 모서리로 이동했다. 상하 여백 최소화(P2-B): 이미지·자막에 세로 양보. */}
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
        {/* ⓘ 저작권 — 상단 어트리뷰션 바 제거(F7)를 대체하는 1탭 도달점. 뒤로가기와 같은
            h-10 w-10로 헤더 좌우 균형을 맞춘다. 어트리뷰션 데이터가 없으면 자리만 비운다. */}
        {attributionRows.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowAttribution(true)}
            aria-label="저작권 정보"
            aria-haspopup="dialog"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-pill border border-outline bg-surface text-text-variant transition-colors duration-200 ease-kiki hover:bg-surface-2"
          >
            <Info className="h-5 w-5" aria-hidden />
          </button>
        ) : (
          <span className="h-10 w-10 shrink-0" aria-hidden />
        )}
      </header>

      {/* 본문 — 상하 1단(P1-D) + P2-B 재배치.
          이미지 행이 flex-1로 남는 세로를 전부 흡수하고, 자막·컨트롤은 내용만큼만 차지한다.
          좌우 이동 버튼은 이미지 옆(md↑)·이미지 위 오버레이(모바일)로 옮겨 하단 1행을 비웠다. */}
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 px-2 pb-2 md:gap-3 md:px-4">
        {/* 이미지 행 — [◀] 이미지 [▶]. 바탕 카드 없음(P2-A), 비율 보존은 PageImage 담당. */}
        <div className="flex min-h-0 w-full flex-1 items-center justify-center gap-1 md:gap-3">
          <NavButton
            direction="prev"
            onClick={userPrev}
            disabled={isFirst}
            className="hidden lg:inline-flex"
          />
          {/* 스와이프 판정 영역(Wave 2 F7) = 그림 영역. 아이가 미는 곳이 그림이고,
              하단 컨트롤(토글·재생·완독)까지 포함하면 버튼 드래그가 넘김으로 새어 든다.
              오버레이 이동 버튼·표지 시작 버튼도 이 안에 있지만, 탭은 이동량이 문턱에
              못 미쳐 넘김으로 판정되지 않는다(문턱 SWIPE_MIN_PX). */}
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="relative flex h-full min-h-0 flex-1 items-center justify-center overflow-hidden"
          >
            {/* 책넘김 3D 컬(Task 2) — 슬라이드 key로 remount돼 면마다 enter 애니메이션이 돈다.
                이미지만 감싸고 오버레이(이동 버튼·표지 시작·위치표시)는 밖에 둬 함께 돌지 않게 한다.
                방향은 turnDir(직전 goPrev/goNext가 설정), 감속 모드는 reduceMotionRef로 생략. */}
            <TurningPage
              key={page.key}
              direction={turnDir}
              reduceMotion={reduceMotionRef.current}
            >
              <PageImage key={page.imageUrl} src={page.imageUrl} alt={page.imageAlt} />
            </TurningPage>
            {/* 모바일·태블릿(<lg) — 좌우 버튼이 이미지 폭을 잠식하므로 이미지 위 오버레이로 둔다. */}
            <NavButton
              direction="prev"
              onClick={userPrev}
              disabled={isFirst}
              overlay
              className="absolute left-1 top-1/2 -translate-y-1/2 lg:hidden"
            />
            <NavButton
              direction="next"
              onClick={userNext}
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
            {/* 페이지 위치(F9) — 이미지 우하단 모서리. 헤더에서 이리로 이동(상단 바 제거로
                커진 그림 곁에 진행도를 둔다). 표지='표지', 본문='n / 전체본문수'(표지는 별도
                트랙이라 본문 카운트 제외 — 기존 positionLabel). solid bg(투명도 미사용).
                pointer-events-none으로 이미지·오버레이 탭을 막지 않는다. */}
            <span className="pointer-events-none absolute bottom-1 right-1 rounded-pill border border-outline bg-surface px-2.5 py-1 text-xs font-semibold tabular-nums text-text-variant shadow-elev-1">
              {page.positionLabel}
            </span>
          </div>
          <NavButton
            direction="next"
            onClick={userNext}
            disabled={isLast}
            className="hidden lg:inline-flex"
          />
        </div>

        {/* 자막 — 확대(P2-B) 후 P2-C에서 문장 간격 확보: 크기 한 단계 축소 + 행간 loose(2.0).
            한 줄이 너무 길지 않도록 max-w-4xl 상한 유지.
            Wave 2 F6: 자막을 끄면 이 블록 자체를 렌더하지 않는다 — 껍데기만 남기면 부모의
            gap-2가 빈 줄로 남아 그림이 그만큼 못 커진다. 반면 '소리가 없어요' 안내는 자막이
            아니라 상태 표시라서 토글과 무관하게 유지한다(왜 조용한지 알려주는 정보). */}
        {(showSubtitle || !page.text) && (
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
        )}

        {/* 무음면 카운트다운(Wave 1.6 F6) — 연속 듣기 모드에서 오디오 없는 면이 몇 초 뒤
            넘어가는지 숫자로 알린다(멈춘 것처럼 보이는 문제 해소). 인라인 문구(copy.ts 미편입).
            조건은 silentCountdown 상태 하나로 충족 — 토글 OFF·오디오 면·마지막 면이면 null. */}
        {silentCountdown !== null && (
          <p className="shrink-0 text-center text-sm font-semibold text-text-variant">
            <span className="tabular-nums text-primary">{silentCountdown}</span>초 후 다음 장
          </p>
        )}

        {/* 하단 1행 — 자동넘김(좌) · 재생(중앙, 주 동작) · 완독(우).
            grid 3열(1fr auto 1fr)이라 좌우 폭이 달라도 재생 버튼이 화면 중앙에 고정된다.
            Wave 1.7b(스타일만): 자막과 시각 분리를 위해 상단 회색 구분선(border-outline #E8E2D9)
            + 흰색→옅은 회색 그라데이션(from-surface #FFF → to-surface-2, semantic 토큰·투명도
            미사용으로 Tailwind v3 hex 렌더 이슈 회피). pt-2는 구분선과 컨트롤 사이 여백(가독성).
            후속: 구분선·그라데이션을 가로 100%로 — 바깥 밴드 래퍼가 부모 컨텐츠열 px를 -mx로
            상쇄해 리더 폭 전체를 덮고(경계선 edge-to-edge), 안쪽에서 px로 되돌려 컨트롤은
            max-w-4xl mx-auto로 기존 위치를 그대로 유지한다. 이미지 행(flex-1) 흡수로 무스크롤 불변. */}
        <div className="w-full shrink-0 border-t border-outline bg-gradient-to-b from-surface to-surface-2 pt-2 -mx-2 px-2 md:-mx-4 md:px-4">
          <div className="mx-auto grid w-full max-w-4xl grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex items-center justify-start gap-1.5">
            {/* 자막 스위치 — 아이콘 버튼에서 스위치로 통일(피드백 v2 Task 1). '자동 넘김'과
                동일한 스위치 언어(h-6 w-11 pill, primary=켜짐)를 써 두 토글의 시각·조작을 맞춘다.
                켜짐=자막 표시. 라벨 '자막'은 md 미만에서 접어(P1-D 단일행 유지) 스위치만 남기고,
                md 이상에서 노출한다. 접힘 구간에도 aria-label로 스크린리더 정보는 유지된다. */}
            <button
              type="button"
              role="switch"
              aria-checked={showSubtitle}
              aria-label="자막 표시"
              onClick={() => setShowSubtitle((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill border transition-colors duration-200 ease-kiki ${
                showSubtitle
                  ? 'border-transparent bg-primary'
                  : 'border-text-disabled bg-surface-2'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-pill bg-surface shadow-elev-1 transition-transform duration-200 ease-kiki ${
                  showSubtitle ? 'translate-x-[1.375rem]' : 'translate-x-[0.125rem]'
                }`}
              />
            </button>
            <span className="hidden whitespace-nowrap text-sm text-text-variant md:inline">
              자막
            </span>
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
            {/* 토글 라벨(F4) — md 미만에서만 접는다(hidden md:inline). 접히는 구간에서도 스위치의
                aria-label('재생 후 자동 넘김')은 그대로라 스크린리더 정보 손실은 0이다.
                whitespace-nowrap 유지 — 노출 구간에서 두 줄로 흘러 P1-D를 깨지 않게. */}
            <span className="hidden whitespace-nowrap text-sm text-text-variant md:inline">
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
          startRaf();
        }}
        onPause={() => {
          setIsPlaying(false);
          stopRaf();
        }}
        onEnded={handleEnded}
      />

      {/* 어트리뷰션 팝오버(Wave 1.7 F7) — 상단 바 제거를 대체해 CC BY 필수 4요소를 담는다:
          ① 작가(+illustrator) ② 책 제목 ③ 라이선스명+링크 ④ 원본 보기(새 탭). 배경은 색
          투명도 대신 backdrop-blur-sm(Tailwind v3 hex 토큰 투명도 미렌더 회피), 카드는 solid
          bg-surface. 외부 링크는 target=_blank + rel=noopener noreferrer(license-rules §7.2). */}
      {showAttribution && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="저작권 정보"
          className="fixed inset-0 z-30 flex items-end justify-center backdrop-blur-sm sm:items-center"
        >
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setShowAttribution(false)}
            className="absolute inset-0 h-full w-full cursor-default"
          />
          <div className="relative z-10 m-3 w-full max-w-md rounded-lg border border-outline bg-surface p-5 shadow-elev-modal">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-body text-base font-semibold text-text">저작권 정보</h2>
              <button
                type="button"
                onClick={() => setShowAttribution(false)}
                aria-label="닫기"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-text-variant transition-colors duration-200 ease-kiki hover:bg-surface-2"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <dl className="flex flex-col gap-2 text-sm">
              {/* ② 책 제목 — books.title 원문 그대로. */}
              <div className="flex items-baseline gap-2">
                <dt className="shrink-0 font-semibold text-text">📖 제목</dt>
                <dd className="break-keep text-text-variant">{title}</dd>
              </div>
              {attributionRows.map((row) => {
                if (row.key === 'license') {
                  return (
                    <div key={row.key} className="flex items-baseline gap-2">
                      <dt className="shrink-0 font-semibold text-text">{row.label}</dt>
                      <dd className="min-w-0">
                        {row.href ? (
                          <a
                            href={row.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-tertiary transition-colors duration-200 ease-kiki hover:underline"
                          >
                            {row.value}
                          </a>
                        ) : (
                          <span className="text-text-variant">{row.value}</span>
                        )}
                      </dd>
                    </div>
                  );
                }
                if (row.key === 'originalLink') {
                  return (
                    <div key={row.key} className="flex items-baseline gap-2">
                      <dt className="shrink-0 font-semibold text-text">{row.label}</dt>
                      <dd className="min-w-0">
                        <a
                          href={row.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-tertiary transition-colors duration-200 ease-kiki hover:underline"
                        >
                          새 탭에서 열기
                        </a>
                      </dd>
                    </div>
                  );
                }
                // 작가 / 출판사 / illustrator — 라벨 + 값
                return (
                  <div key={row.key} className="flex items-baseline gap-2">
                    <dt className="shrink-0 font-semibold text-text">{row.label}</dt>
                    <dd className="break-keep text-text-variant">{row.value}</dd>
                  </div>
                );
              })}
            </dl>
            <p className="mt-4 text-xs text-text-variant">
              모든 도서는 CC BY 4.0 라이선스입니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
