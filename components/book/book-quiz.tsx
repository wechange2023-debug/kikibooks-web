'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, RotateCcw, Sparkles, Volume2, X } from 'lucide-react';

import { buildQuiz, type QuizQuestion } from '@/lib/quiz/build-quiz';
import type { QuizSource } from '@/lib/quiz/quiz-source';

/**
 * 책 퀴즈 — 3문항 탭 기반 (ADR-0065 Amendment #2 D-B3·D-B4·D-B5 · Q-2b).
 *
 * ★ 무기록(D1 · D-B5): **네트워크 쓰기 0건.** 점수는 이 컴포넌트의 state로만 존재하고
 *   언마운트·새로고침과 함께 사라진다. fetch·server action 호출 경로가 아예 없다
 *   (오디오 mp3 GET과 이미지 GET만 — 공개 Storage 읽기).
 *
 * ★ 재추첨(D-B2): 문항은 **클라이언트에서** `buildQuiz(source)`로 만든다. 그래서
 *   "다시 하기"가 서버 왕복 없이 새로 뽑는다. 단어 놀이가 쓰는 구조와 같다
 *   (`word-play.tsx:167` `startQuiz`).
 *
 * ★ 오답 무벌점(D-B5): 점수를 깎지 않는다. 오답을 고르면 정답을 보여주고 다음으로 넘어간다.
 *
 * ★ 질문 음성 + 텍스트 병기(D-B4): 문항이 바뀌면 한국어 지시문(Seoyeon)을 자동 재생하고,
 *   **같은 문장을 화면에도 띄운다.** 음성이 아직 업로드되지 않았거나 자동재생이 막혀도
 *   글자는 그대로 보인다 — 그것이 병기의 안전망이다.
 *
 * 디자인 제약(docs/design-system.md v2 · ADR-0060):
 *   - 터치 타깃 44px 하한 / 아이 조작 버튼 48px 권장(§6.5) → 보기 `min-h-[64px]`, 버튼 `h-12`
 *   - 본문 16px 이상 → `text-body` 이상
 *   - font-weight 700 상한 → `font-bold`까지만
 *   - 정답/오답을 **색만으로 전달하지 않는다** → 색 + 아이콘 + 텍스트 3중 병기
 *   - `prefers-reduced-motion: reduce` → `motion-reduce:transition-none`
 *   - 색은 semantic 토큰만(Hard Rule 10). raw value 0건
 *   - 외부 라이브러리 추가 0건(Hard Rule 11) — word-play.tsx와 같은 토큰 문자열을 쓴다
 */

/** 오답 표시 후 다음 문항까지 머무는 시간(ms). 아이가 정답을 읽을 시간(word-play.tsx:37과 동일). */
const FEEDBACK_HOLD_MS = 1600;

type Phase = 'quiz' | 'result';

const PRIMARY_BUTTON =
  'inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-pill bg-cta px-6 sm:px-8 text-body font-semibold text-on-cta shadow-elev-cta transition-all duration-200 ease-kiki hover:-translate-y-px hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta/50 focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0';

const SECONDARY_BUTTON =
  'inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-pill border border-outline bg-surface px-5 sm:px-6 text-body font-semibold text-text transition-colors duration-200 ease-kiki hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 motion-reduce:transition-none';

const CHOICE_BASE =
  'flex w-full flex-col items-center justify-center gap-2 rounded-lg border p-2 transition-all duration-200 ease-kiki outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 motion-reduce:transition-none disabled:cursor-default';

/** 채점 후 보기 톤. 색 단독 전달 금지라 아이콘·텍스트가 함께 붙는다(아래 GradeMark). */
function toneOf(graded: boolean, isAnswer: boolean, isPicked: boolean): string {
  if (!graded) return 'border-outline bg-surface-2 hover:bg-surface-3';
  if (isAnswer) return 'border-success bg-surface-2';
  if (isPicked) return 'border-error bg-surface-2';
  return 'border-outline bg-surface-2 opacity-60';
}

function GradeMark({ isAnswer }: { isAnswer: boolean }) {
  return (
    <span
      className={`flex items-center gap-1 text-caption font-semibold ${
        isAnswer ? 'text-success' : 'text-error'
      }`}
    >
      {isAnswer ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <X className="h-4 w-4" aria-hidden="true" />
      )}
      {isAnswer ? '정답' : '아니에요'}
    </span>
  );
}

/**
 * 오디오 1개를 처음부터 재생하는 훅.
 *
 * 질문 음성과 본문 클립을 **각각 다른 엘리먼트**로 다룬다 — 문항 ①은 지시문을 들려준 뒤
 * 본문 문장을 들려줘야 해서, 하나를 돌려쓰면 둘이 서로를 끊는다.
 */
function usePlayer() {
  const ref = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    const el = ref.current;
    if (el) el.pause();
  }, []);

  /**
   * @returns 재생이 **실제로 시작됐는지**. false면 자동재생 정책 등에 막힌 것이다.
   *   호출부는 이 값으로 "이어 재생"을 걸지 말지 정한다 — 막힌 뒤에 다음 트랙을
   *   억지로 걸면 그것도 막히고, 콘솔만 시끄러워진다.
   */
  const play = useCallback(async (src: string | null): Promise<boolean> => {
    const el = ref.current;
    if (!el || !src) return false;
    if (el.src !== src) el.src = src;
    el.currentTime = 0;
    try {
      await el.play();
      return true;
    } catch {
      // 자동재생 차단(상호작용 0 상태에서 직접 URL 진입 등) — **조용히 대기**한다.
      // 화면 텍스트가 병기돼 있고(D-B4), 버튼을 탭하면 그때 정상 재생된다.
      return false;
    }
  }, []);

  useEffect(() => stop, [stop]);

  return { ref, play, stop };
}

export function BookQuiz({ source, exitHref }: { source: QuizSource; exitHref: string }) {
  // 첫 조립은 마운트 시 1회 — 렌더마다 새로 뽑히면 화면이 요동친다.
  const [questions, setQuestions] = useState<QuizQuestion[]>(() => buildQuiz(source));
  const [phase, setPhase] = useState<Phase>('quiz');
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  const prompt = usePlayer();
  const clip = usePlayer();

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    },
    [],
  );

  const current = questions[index];

  /**
   * 문항 진입 시 오디오 자동 연결 (Q-2c).
   *
   * 지시문(Seoyeon)을 들려주고, **끝나면** 문항 ①의 영어 문장 클립을 이어 재생한다.
   * 아이가 버튼을 찾아 누르지 않아도 "문제를 듣는" 상태가 되는 것이 목적이다.
   *
   * ★ 겹치지 않는다: `ended` 이벤트를 기다렸다가 다음을 건다. 두 트랙이 서로 다른
   *   `<audio>`라 동시에 울릴 수 있는데, 순서를 이벤트로 묶어 그것을 막는다.
   * ★ 자동재생이 막히면 **아무것도 하지 않는다**: `play()`가 false를 돌려주면 이어
   *   재생을 걸지 않는다. 콘솔 에러도, 깨진 UI도 남기지 않고 조용히 대기한다 —
   *   "문제 다시 듣기"·"문장 듣기" 버튼을 탭하면 그때 정상 재생된다.
   * ★ 문항을 넘기거나 언마운트하면 대기 중인 연결을 끊는다(cancelled 플래그 + 리스너 해제).
   */
  useEffect(() => {
    if (phase !== 'quiz' || !current) return;

    const promptEl = prompt.ref.current;
    let cancelled = false;
    let onEnded: (() => void) | null = null;

    // 문항 ①만 이어 재생 대상이다. ②③은 지시문만 들려주면 문제가 성립한다.
    const nextClip = current.id === 'q1' ? current.clipUrl : null;

    void prompt.play(current.promptAudioUrl).then((started) => {
      if (cancelled || !started || !nextClip || !promptEl) return;
      onEnded = () => {
        if (!cancelled) void clip.play(nextClip);
      };
      promptEl.addEventListener('ended', onEnded, { once: true });
    });

    return () => {
      cancelled = true;
      if (promptEl && onEnded) promptEl.removeEventListener('ended', onEnded);
    };
    // 문항 전환에만 반응해야 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index, questions]);

  const restart = useCallback(() => {
    prompt.stop();
    clip.stop();
    // 재추첨 — 같은 재료에서 문항·보기를 새로 뽑는다(D-B2).
    setQuestions(buildQuiz(source));
    setIndex(0);
    setPicked(null);
    setScore(0);
    setPhase('quiz');
  }, [source, prompt, clip]);

  const handlePick = useCallback(
    (key: string) => {
      if (!current || picked !== null) return; // 채점 중 중복 선택 차단
      setPicked(key);
      // 오답이어도 감점하지 않는다(D-B5 무벌점) — 맞힌 개수만 센다.
      if (key === current.answerKey) setScore((s) => s + 1);

      holdTimerRef.current = setTimeout(() => {
        setPicked(null);
        clip.stop();
        if (index + 1 < questions.length) {
          setIndex((i) => i + 1);
        } else {
          prompt.stop();
          setPhase('result');
        }
      }, FEEDBACK_HOLD_MS);
    },
    [current, picked, index, questions.length, prompt, clip],
  );

  const graded = picked !== null;

  const answerLabel = useMemo(() => {
    if (!current || !graded) return '';
    if (picked === current.answerKey) return '정답입니다';
    return '아니에요. 초록색 표시가 정답이에요';
  }, [current, graded, picked]);

  // 재료는 있는데 문항이 하나도 안 나오는 경우 — 페이지 게이트가 먼저 막지만 안전망을 둔다.
  if (questions.length === 0) {
    return (
      <section className="flex w-full max-w-md flex-col items-center gap-4" aria-label="책 퀴즈">
        <Link href={exitHref} className={PRIMARY_BUTTON}>
          돌아가기
        </Link>
      </section>
    );
  }

  return (
    // max-w-screen-2xl(1536px) — PC 보기 그림을 약 2배로 키우기 위한 폭이다(Q-2d).
    // 3열 기준 한 변 약 230px → 약 490px. 화면이 좁으면 뷰포트 폭에 맞춰 자연히 줄어든다.
    <section className="flex w-full max-w-screen-2xl flex-col gap-4" aria-label="책 퀴즈">
      {/* 질문 음성(한국어)과 본문 클립을 분리한다 — 서로 끊지 않게. */}
      <audio ref={prompt.ref} preload="none" />
      <audio ref={clip.ref} preload="none" />

      {phase === 'quiz' && current && (
        <div className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-elev-1">
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-label text-text-variant">
              {index + 1} / {questions.length}
            </p>
            {/* 음성과 **같은 문장**을 글자로 병기한다(D-B4). */}
            <h1 className="font-display text-h3 font-bold text-text">{current.prompt}</h1>
            <button
              type="button"
              onClick={() => void prompt.play(current.promptAudioUrl)}
              className="inline-flex h-11 items-center justify-center gap-1 rounded-pill px-3 text-label font-semibold text-primary transition-colors duration-200 ease-kiki hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none"
            >
              <Volume2 className="h-5 w-5" aria-hidden="true" />
              문제 다시 듣기
            </button>
          </div>

          {/* ① 문제는 본문 낭독이다 — 기존 페이지 mp3를 그대로 쓴다(신규 합성 0건).
              문항 진입 시 지시문에 이어 자동 재생되므로, 이 버튼은 **다시 듣기**다. */}
          {current.id === 'q1' && (
            <button
              type="button"
              onClick={() => void clip.play(current.clipUrl)}
              className={`${PRIMARY_BUTTON} self-center`}
            >
              <Volume2 className="h-5 w-5" aria-hidden="true" />
              문장 다시 듣기
            </button>
          )}

          {current.id === 'q3' ? (
            /* ③은 문제 그림 1장 + 문장 보기다.
               PC에서는 **좌우 2단**(그림 | 문장)으로 편다 — 세로로 쌓으면 그림을 키우는
               만큼 문장 보기가 화면 밖으로 밀린다. 모바일은 그대로 세로로 쌓는다. */
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
              <div className="mx-auto flex aspect-[4/3] w-full max-w-2xl items-center justify-center overflow-hidden rounded-lg bg-surface-2 md:mx-0 md:w-1/2 md:max-w-none">
                {/* 삽화는 외부 CDN 임의 경로라 next/image를 쓰지 않는다 — 원격 도메인
                    화이트리스트 밖 호스트가 섞이고 최적화도 불요하다
                    (asb-reader.tsx:130-133 선례와 같은 근거). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={current.imageUrl}
                  alt="이 그림에 맞는 문장을 골라요"
                  className="max-h-full max-w-full object-contain"
                />
              </div>

              <ul className="flex flex-col gap-2 md:w-1/2">
                {current.choices.map((choice) => {
                  const isAnswer = choice.key === current.answerKey;
                  return (
                    <li key={choice.key}>
                      <button
                        type="button"
                        disabled={graded}
                        onClick={() => handlePick(choice.key)}
                        className={`${CHOICE_BASE} min-h-[64px] px-4 py-3 ${toneOf(graded, isAnswer, picked === choice.key)}`}
                      >
                        <span className="text-body text-text">{choice.text}</span>
                        {graded && (isAnswer || picked === choice.key) && (
                          <GradeMark isAnswer={isAnswer} />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            /* 모바일(<768px)은 **세로 1열**이라 그림 하나가 카드 폭을 다 쓴다.
               768px 이상에서만 보기 수만큼 가로로 편다(②는 2열, ①은 3열).
               세로로 길어져 스크롤이 생겨도 무방하다 — 아이에게는 큰 그림이 먼저다. */
            <ul
              className={`mx-auto grid w-full gap-3 ${
                current.choices.length === 2
                  ? // 2장은 3장보다 한 칸이 커지므로 폭을 조금 묶어 세로 길이를 잡는다.
                    'md:max-w-4xl md:grid-cols-2'
                  : 'md:grid-cols-3'
              }`}
            >
              {current.choices.map((choice) => {
                const isAnswer = choice.key === current.answerKey;
                return (
                  <li key={choice.key}>
                    <button
                      type="button"
                      disabled={graded}
                      onClick={() => handlePick(choice.key)}
                      className={`${CHOICE_BASE} ${toneOf(graded, isAnswer, picked === choice.key)}`}
                    >
                      <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-surface-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={choice.imageUrl}
                          alt=""
                          className="max-h-full max-w-full object-contain"
                        />
                      </span>
                      {graded && (isAnswer || picked === choice.key) && (
                        <GradeMark isAnswer={isAnswer} />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* 스크린리더용 즉시 안내 — 시각 피드백과 동일 정보를 텍스트로 준다. */}
          <p className="sr-only" role="status" aria-live="polite">
            {answerLabel}
          </p>
        </div>
      )}

      {phase === 'result' && (
        <div className="flex flex-col items-center gap-4 rounded-lg bg-surface p-6 text-center shadow-elev-1">
          <Sparkles className="h-8 w-8 text-primary" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-h3 font-bold text-text">
              {questions.length}개 중 {score}개 맞혔어요!
            </h1>
            <p className="text-label text-text-variant">책 퀴즈 끝! 잘했어요</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={restart} className={PRIMARY_BUTTON}>
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
              다시 하기
            </button>
            <Link href={exitHref} className={SECONDARY_BUTTON}>
              그만하기
            </Link>
          </div>
        </div>
      )}

      {phase === 'quiz' && (
        <div className="flex justify-center">
          <Link href={exitHref} className={SECONDARY_BUTTON}>
            그만하기
          </Link>
        </div>
      )}
    </section>
  );
}
