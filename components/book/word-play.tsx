'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, RotateCcw, Sparkles, Volume2, X } from 'lucide-react';

import type { WordPlayCard } from '@/lib/wordplay/get-word-play';

/**
 * 단어 놀이 — 단어카드 + 발음 기반 4지선다 퀴즈 (ADR-0065 D3~D5 · E-2b).
 *
 * ★ 무기록(ADR-0065 D1): **네트워크 쓰기 0건.** 점수는 이 컴포넌트의 state로만 존재하고
 *   언마운트·새로고침과 함께 사라진다. fetch·server action 호출 경로가 아예 없다
 *   (오디오 mp3 GET만 — 공개 Storage 읽기).
 *
 * ★ 완독 흐름 무접촉(ADR-0065 D3): 본 컴포넌트는 celebrate 화면 **안에서만** 살고,
 *   lib/book/reading-session.ts의 완독·redirect 구조를 건드리지 않는다.
 *
 * 재생 방식은 오디오 리더 선례를 따른다(신규 방식 발명 0건):
 *   - `<audio ref>` + `el.currentTime` + `el.play().catch()`
 *     — components/book/audio-reader.tsx:405·:573-579·:1139-1143
 *   - 구간 종료 감시는 requestAnimationFrame — 같은 파일 :550-558 `startRaf`
 *
 * 디자인 제약(docs/design-system.md v2):
 *   - 터치 타깃 44px 하한 / 아이 조작 버튼 48px 권장(§6.5 :478·:482) → 카드 `min-h-[64px]`,
 *     버튼 `h-12`(48px) 이상, 인접 간격 `gap-2`(8px) 이상(:479)
 *   - 본문 16px 이상(:274) → 카드·선택지는 `text-body`(16px) 이상
 *   - font-weight 700 상한(:286) → `font-bold`까지만. `font-extrabold` 미사용
 *   - 정답/오답을 **색만으로 전달하지 않는다**(:484) → 색 + 아이콘 + 텍스트 3중 병기
 *   - `prefers-reduced-motion: reduce` → `motion-reduce:transition-none`(:550)
 *   - 색은 semantic 토큰만(Hard Rule 10). raw value 0건
 */

/** 퀴즈 문항 수 상한 (ADR-0065 §단어 선정 규칙 제안값 3문항). */
const MAX_QUESTIONS = 3;
/** 한 문항의 선택지 수 (ADR-0065 D5 4지선다). */
const CHOICES_PER_QUESTION = 4;
/** 오답 표시 후 다음 문항까지 머무는 시간(ms). 아이가 정답을 읽을 시간. */
const FEEDBACK_HOLD_MS = 1600;

type Phase = 'idle' | 'cards' | 'quiz' | 'result';

interface Question {
  /** 정답 카드(반드시 playable — 발음을 들려줘야 하므로). */
  answer: WordPlayCard;
  /** 정답 + 오답 3개를 섞은 선택지. */
  choices: WordPlayCard[];
}

/** Fisher–Yates. 외부 라이브러리 없이 자체 구현(Hard Rule 11). */
function shuffle<T>(input: readonly T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 문항 생성 (ADR-0065 Q2 결정 — 오답은 **같은 책 후보**에서 무작위).
 *
 * - 정답은 `playable`인 카드에서만 뽑는다(발음을 들려줄 수 없으면 문제가 성립하지 않는다).
 * - 문항 수 = min(MAX_QUESTIONS, 재생가능 카드 수, 전체 카드 수 - 1).
 *   카드가 4장이면 오답 3개를 채우기 위해 전체가 필요하므로 -1이 상한이다.
 */
function buildQuestions(cards: readonly WordPlayCard[]): Question[] {
  const playable = cards.filter((c) => c.playable);
  const count = Math.min(MAX_QUESTIONS, playable.length, cards.length - 1);
  if (count <= 0) return [];

  return shuffle(playable)
    .slice(0, count)
    .map((answer) => {
      const distractors = shuffle(cards.filter((c) => c.word !== answer.word)).slice(
        0,
        CHOICES_PER_QUESTION - 1,
      );
      return { answer, choices: shuffle([answer, ...distractors]) };
    });
}

/**
 * 구간 재생 훅 — mp3 하나에서 [startMs, endMs) 만 재생한다.
 *
 * audio-reader.tsx:550-558의 rAF 추적 패턴을 구간 종료 감시로 좁혀 쓴다.
 * `timeupdate` 이벤트는 250ms 안팎으로 성기게 발화해 500ms대 단어 구간을 넘겨버린다.
 */
function useClipPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const stopAtRef = useRef<number>(Number.POSITIVE_INFINITY);
  const [playingWord, setPlayingWord] = useState<string | null>(null);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    stopRaf();
    const el = audioRef.current;
    if (el) el.pause();
    setPlayingWord(null);
  }, [stopRaf]);

  const play = useCallback(
    (card: WordPlayCard) => {
      if (!card.playable || !card.audioUrl || card.startMs === null || card.endMs === null) {
        return;
      }
      const el = audioRef.current;
      if (!el) return;

      stopRaf();
      stopAtRef.current = card.endMs / 1000;

      // 같은 mp3면 src를 다시 넣지 않는다(재로딩으로 첫 재생이 끊기는 것을 막는다).
      if (el.src !== card.audioUrl) el.src = card.audioUrl;
      el.currentTime = card.startMs / 1000;
      setPlayingWord(card.word);

      const tick = () => {
        if (el.currentTime >= stopAtRef.current) {
          el.pause();
          setPlayingWord(null);
          rafRef.current = null;
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };

      el.play()
        .then(() => {
          rafRef.current = requestAnimationFrame(tick);
        })
        .catch(() => {
          // 브라우저 자동재생 정책 등 — 조용히 무시한다(카드는 그대로 보인다).
          setPlayingWord(null);
        });
    },
    [stopRaf],
  );

  useEffect(() => stop, [stop]);

  return { audioRef, play, stop, playingWord };
}

const CARD_BASE =
  'flex min-h-[64px] items-center justify-center gap-2 rounded-lg border px-3 py-3 text-body font-semibold transition-all duration-200 ease-kiki outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 motion-reduce:transition-none';

const PRIMARY_BUTTON =
  'inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-cta px-8 text-body font-semibold text-on-cta shadow-elev-cta transition-all duration-200 ease-kiki hover:-translate-y-px hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta/50 focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0';

const SECONDARY_BUTTON =
  'inline-flex h-12 items-center justify-center gap-2 rounded-pill border border-outline bg-surface px-6 text-body font-semibold text-text transition-colors duration-200 ease-kiki hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 motion-reduce:transition-none';

export function WordPlay({ cards }: { cards: WordPlayCard[] }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const { audioRef, play, stop, playingWord } = useClipPlayer();

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    },
    [],
  );

  /** 퀴즈 출제가 가능한가 — 재생 가능 카드가 있어야 발음 문제를 낼 수 있다. */
  const quizAvailable = useMemo(() => buildQuestions(cards).length > 0, [cards]);

  const startQuiz = useCallback(() => {
    stop();
    const next = buildQuestions(cards);
    setQuestions(next);
    setQuestionIndex(0);
    setPicked(null);
    setScore(0);
    setPhase(next.length > 0 ? 'quiz' : 'result');
  }, [cards, stop]);

  const current = questions[questionIndex];

  // 문항이 바뀌면 정답 발음을 자동으로 한 번 들려준다(문제 = 발음, ADR-0065 Q4).
  useEffect(() => {
    if (phase === 'quiz' && current) play(current.answer);
    // play는 useCallback으로 고정돼 있고, 문항 전환에만 반응해야 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, questionIndex]);

  const handlePick = useCallback(
    (word: string) => {
      if (!current || picked !== null) return; // 채점 중 중복 선택 차단
      setPicked(word);
      if (word === current.answer.word) setScore((s) => s + 1);

      holdTimerRef.current = setTimeout(() => {
        setPicked(null);
        if (questionIndex + 1 < questions.length) {
          setQuestionIndex((i) => i + 1);
        } else {
          stop();
          setPhase('result');
        }
      }, FEEDBACK_HOLD_MS);
    },
    [current, picked, questionIndex, questions.length, stop],
  );

  const exit = useCallback(() => {
    stop();
    setPhase('idle');
  }, [stop]);

  return (
    <section className="w-full max-w-md" aria-label="단어 놀이">
      {/* 구간 재생용 — 화면에 노출하지 않는다(카드 탭이 컨트롤). */}
      <audio ref={audioRef} preload="none" />

      {phase === 'idle' && (
        <div className="flex justify-center">
          <button type="button" onClick={() => setPhase('cards')} className={SECONDARY_BUTTON}>
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            단어 놀이 해볼까?
          </button>
        </div>
      )}

      {phase === 'cards' && (
        <div className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-elev-1">
          <div className="flex flex-col gap-1 text-center">
            <h2 className="font-display text-h3 font-bold text-text">이 책에 나온 단어</h2>
            <p className="text-label text-text-variant">단어를 눌러 소리를 들어보세요</p>
          </div>

          <ul className="grid grid-cols-2 gap-2">
            {cards.map((card) => (
              <li key={card.word}>
                {card.playable ? (
                  <button
                    type="button"
                    onClick={() => play(card)}
                    aria-label={`${card.word} 발음 듣기`}
                    className={`${CARD_BASE} w-full ${
                      playingWord === card.word
                        ? 'border-primary bg-primary-container text-on-primary-container'
                        : 'border-outline bg-surface-2 text-text hover:bg-surface-3'
                    }`}
                  >
                    <Volume2
                      className={`h-5 w-5 shrink-0 ${
                        playingWord === card.word ? 'text-primary' : 'text-text-variant'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{card.word}</span>
                  </button>
                ) : (
                  // 발음 재생 불가 — 스피커 아이콘 없이 표시만 한다(E-2b 1-e).
                  <div
                    className={`${CARD_BASE} w-full cursor-default border-outline bg-surface-2 text-text`}
                  >
                    <span className="truncate">{card.word}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            {quizAvailable && (
              <button type="button" onClick={startQuiz} className={PRIMARY_BUTTON}>
                퀴즈 풀어보기
              </button>
            )}
            <button type="button" onClick={exit} className={SECONDARY_BUTTON}>
              그만하기
            </button>
          </div>
        </div>
      )}

      {phase === 'quiz' && current && (
        <div className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-elev-1">
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-label text-text-variant">
              {questionIndex + 1} / {questions.length}
            </p>
            <h2 className="font-display text-h3 font-bold text-text">어떤 단어일까요?</h2>
          </div>

          <button
            type="button"
            onClick={() => play(current.answer)}
            aria-label="다시 듣기"
            className={`${PRIMARY_BUTTON} self-center`}
          >
            <Volume2 className="h-5 w-5" aria-hidden="true" />
            다시 듣기
          </button>

          <ul className="grid grid-cols-2 gap-2">
            {current.choices.map((choice) => {
              const isAnswer = choice.word === current.answer.word;
              const isPicked = picked === choice.word;
              // 채점 후에만 색을 입힌다. 색 단독 전달 금지(:484) — 아이콘·텍스트를 함께 붙인다.
              const graded = picked !== null;
              const tone = !graded
                ? 'border-outline bg-surface-2 text-text hover:bg-surface-3'
                : isAnswer
                  ? 'border-success bg-surface-2 text-text'
                  : isPicked
                    ? 'border-error bg-surface-2 text-text'
                    : 'border-outline bg-surface-2 text-text-variant';

              return (
                <li key={choice.word}>
                  <button
                    type="button"
                    disabled={graded}
                    onClick={() => handlePick(choice.word)}
                    className={`${CARD_BASE} w-full flex-col gap-1 ${tone} disabled:cursor-default`}
                  >
                    <span className="truncate">{choice.word}</span>
                    {graded && (isAnswer || isPicked) && (
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
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* 스크린리더용 즉시 안내 — 시각 피드백과 동일 정보를 텍스트로 준다. */}
          <p className="sr-only" role="status" aria-live="polite">
            {picked === null
              ? ''
              : picked === current.answer.word
                ? '정답입니다'
                : `아니에요. 정답은 ${current.answer.word} 입니다`}
          </p>
        </div>
      )}

      {phase === 'result' && (
        <div className="flex flex-col items-center gap-4 rounded-lg bg-surface p-6 text-center shadow-elev-1">
          <Sparkles className="h-8 w-8 text-primary" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-h3 font-bold text-text">
              {questions.length}개 중 {score}개 맞혔어요!
            </h2>
            <p className="text-label text-text-variant">단어 놀이 끝! 잘했어요</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={startQuiz} className={PRIMARY_BUTTON}>
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
              다시 하기
            </button>
            <button type="button" onClick={exit} className={SECONDARY_BUTTON}>
              그만하기
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
