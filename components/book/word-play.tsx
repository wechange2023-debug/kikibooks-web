'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, RotateCcw, Sparkles, Volume2, X } from 'lucide-react';

import type { WordPlayCard } from '@/lib/wordplay/get-word-play';
import { KO_MEANINGS } from '@/lib/wordplay/ko-meanings';

/**
 * 단어 놀이 — 단어카드 + 발음 기반 4지선다 퀴즈 (ADR-0065 D3~D5 · E-2b).
 *
 * ★ 무기록(ADR-0065 D1): **네트워크 쓰기 0건.** 점수는 이 컴포넌트의 state로만 존재하고
 *   언마운트·새로고침과 함께 사라진다. fetch·server action 호출 경로가 아예 없다
 *   (오디오 mp3 GET만 — 공개 Storage 읽기).
 *
 * ★ 거처 이동(ADR-0065 Amendment #2 D-B1 · Q-1): 본 컴포넌트는 이제 celebrate 안이 아니라
 *   전용 화면 `/book/[id]/wordplay`에서 산다. celebrate에는 진입 버튼만 남는다.
 *   그래서 종전의 `idle` 단계("단어 놀이 해볼까?" 버튼)가 사라지고 **`cards`부터 시작**한다.
 *   나가기는 상태 되돌리기가 아니라 `exitHref`로의 **이동**이다(D-B2 이탈 시 즉시 복귀 —
 *   확인 대화상자를 두지 않는다).
 *
 * ★ 완독 흐름 무접촉(ADR-0065 D3 승계 · Amd#2 D-B7): lib/book/reading-session.ts의
 *   완독·redirect 구조를 건드리지 않는다. 완독 여부를 **읽지도 않는다**(Amd#2 D-B2 A안).
 *
 * 뒤집기(ADR-0065 Amendment #4 · D-D1~D-D6): 카드 본체 탭은 **앞/뒤 토글**이고, 발음 재생은
 *   카드 안의 **스피커 전용 <button>**만 한다. 본체까지 <button>으로 두면 스피커와 중첩되어
 *   HTML이 깨지므로, 본체는 role="button" + tabIndex + Enter/Space 처리로 **버튼과 동등한
 *   조작성을 손으로 갖춘다**(D-D2). 그 대가로 두 가지를 직접 막아야 한다 —
 *   포인터는 스피커에서 `stopPropagation`, 키보드는 `e.target === e.currentTarget` 확인이다.
 *   **포인터만 막으면 스피커 포커스 + Enter에서 재생과 뒤집기가 동시에 일어난다.**
 *
 *   면 전환은 **조건부 렌더**다(보이는 면만 DOM에 둔다). 양면을 동시에 두고
 *   `backface-visibility`로 감추는 3D 방식을 쓰면 숨은 면을 `aria-hidden`으로 덮어야 하는데,
 *   그러면 화면낭독기 사용자에게 **뜻이 영영 읽히지 않는다**.
 *
 * 재생 방식(ADR-0065 Amendment #1 · W-1): 단어별 단독 mp3를 **처음부터** 재생한다.
 *   `<audio ref>` + `el.play().catch()` — 오디오 리더 선례(audio-reader.tsx:405·:573-579).
 *   구간 좌표·seek·rAF 감시는 전부 사라졌다. 파일 하나가 곧 한 단어이기 때문이다.
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
/**
 * 뒷면에 띄울 뜻이 없을 때의 표시 (ADR-0065 Amd#4 D-D1).
 *
 * 현재 말뭉치에서는 **뜰 일이 없다** — 사전이 카드가 되는 고유 단어 전량을 덮고 있고,
 * 제외 167종은 애초에 카드로 오지 않는다(Amd#3 D-C1 · select-words.ts:281).
 * 이것이 실제로 화면에 뜬다면 **신규 책이 적재돼 사전 갱신이 밀렸다는 신호**다.
 * 빈 문자열도 앞면 반복도 아닌 이유: 아이에게는 조용하고, 검수자에게는 눈에 띈다.
 */
const FALLBACK_MEANING = '—';

type Phase = 'cards' | 'quiz' | 'result';

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
 * 단어 재생 훅 — 단어 mp3 하나를 **처음부터 끝까지** 재생한다.
 *
 * ★ ADR-0065 Amendment #1(W-1)로 구간 재생이 폐기되면서 크게 단순해졌다.
 *   종전에는 본문 mp3에서 [startMs, endMs)만 잘라야 해서 rAF로 종료 시각을 감시하고
 *   메타데이터 로드를 기다려 seek해야 했다. 이제 파일 자체가 그 단어뿐이라
 *   **seek·구간 감시·경계 클램프가 전부 불필요**하다 — currentTime = 0에서 재생만 한다.
 */
function useWordPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingWord, setPlayingWord] = useState<string | null>(null);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (el) el.pause();
    setPlayingWord(null);
  }, []);

  const play = useCallback((card: WordPlayCard) => {
    if (!card.playable || !card.audioUrl) return;
    const el = audioRef.current;
    if (!el) return;

    const src = card.audioUrl;
    if (el.src !== src) el.src = src;
    el.currentTime = 0;
    setPlayingWord(card.word);

    el.play().catch(() => {
      // 브라우저 자동재생 정책 등 — 조용히 무시한다(카드는 그대로 보인다).
      setPlayingWord(null);
    });
  }, []);

  useEffect(() => stop, [stop]);

  /** 재생이 끝났을 때 강조만 해제한다(pause 불필요 — 이미 끝났다). */
  const clearPlaying = useCallback(() => setPlayingWord(null), []);

  return { audioRef, play, stop, playingWord, clearPlaying };
}

const CARD_BASE =
  'flex min-h-[64px] items-center justify-center gap-2 rounded-lg border px-2 py-3 text-body font-semibold sm:px-3 transition-all duration-200 ease-kiki outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 motion-reduce:transition-none';

const PRIMARY_BUTTON =
  'inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-pill bg-cta px-6 sm:px-8 text-body font-semibold text-on-cta shadow-elev-cta transition-all duration-200 ease-kiki hover:-translate-y-px hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta/50 focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0';

const SECONDARY_BUTTON =
  'inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-pill border border-outline bg-surface px-5 sm:px-6 text-body font-semibold text-text transition-colors duration-200 ease-kiki hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 motion-reduce:transition-none';

interface WordPlayProps {
  cards: WordPlayCard[];
  /**
   * "그만하기"가 향하는 곳. 전용 화면이 된 뒤로 나가기는 state 복귀가 아니라 **이동**이다.
   * 호출부가 celebrate 경로를 넘긴다 — 허브로 돌아가 다음 놀이를 고를 수 있게(Amd#2 D-B1).
   */
  exitHref: string;
}

export function WordPlay({ cards, exitHref }: WordPlayProps) {
  const [phase, setPhase] = useState<Phase>('cards');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const { audioRef, play, stop, playingWord, clearPlaying } = useWordPlayer();

  /**
   * 뒤집힌 카드의 `word` 집합 — **카드별 독립**이다(Amd#4 D-D4). 한 장을 뒤집어도 다른 장은
   * 그대로고, 여러 장이 동시에 뒤집혀 있어도 된다. 한 번에 한 장만 허용하면 아이가 방금
   * 뒤집은 카드가 다음 카드를 누르는 순간 되돌아가 **비교 자체가 불가능**해진다.
   *
   * `card.word`를 키로 쓴다 — 후보는 정규형으로 중복 제거돼 있어 고유하다
   * (`key={card.word}`가 이미 같은 전제 위에 서 있다).
   */
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(() => new Set());
  /** 본체 `aria-labelledby`가 가리킬 면 텍스트의 id 접두사. */
  const faceIdPrefix = useId();

  const toggleFlip = useCallback((word: string) => {
    setFlipped((prev) => {
      // Set을 제자리에서 고치면 참조가 같아 리렌더되지 않는다. 매번 새로 만든다.
      const next = new Set(prev);
      if (next.has(word)) next.delete(word);
      else next.add(word);
      return next;
    });
  }, []);

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
    // 면 상태 초기화(Amd#4 D-D4). 퀴즈를 마치고 cards로 돌아올 경로는 아직 없지만,
    // 빼두면 그 경로가 생기는 순간 이전 회차의 뒤집힘이 유령처럼 남는다.
    setFlipped(new Set());
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

  return (
    <section className="w-full max-w-md" aria-label="단어 놀이">
      {/* 단어 재생용 — 화면에 노출하지 않는다(카드 탭이 컨트롤).
          파일 하나가 곧 한 단어라 끝나면 그대로 종료된다(onEnded로 강조 해제). */}
      <audio
        ref={audioRef}
        preload="none"
        onEnded={clearPlaying}
      />

      {phase === 'cards' && (
        <div className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-elev-1">
          <div className="flex flex-col gap-1 text-center">
            <h2 className="font-display text-h3 font-bold text-text">이 책에 나온 단어</h2>
            <p className="text-label text-text-variant">
              카드를 누르면 뜻이 보여요. 스피커를 누르면 소리가 나요
            </p>
          </div>

          <ul className="grid grid-cols-2 gap-2">
            {cards.map((card, index) => {
              const isFlipped = flipped.has(card.word);
              const isPlaying = playingWord === card.word;
              const faceId = `${faceIdPrefix}-${index}`;
              // 추가 정규화를 하지 않는다(Amd#4 D-D1) — 화면 표기(card.word)가 곧 사전 키다
              // (get-word-play.ts:64-71이 normalizeWord 결과를 그대로 넘긴다).
              // 여기에 toLowerCase()를 덧대면 정규화 지점이 둘로 늘어 정본이 흐려진다.
              //
              // `?? `가 아니라 `Object.hasOwn`인 이유: 객체 리터럴은 Object.prototype을 물려받아
              // `KO_MEANINGS['constructor']`가 undefined가 아니라 **함수**를 돌려준다. `?? `는
              // 그것을 통과시키고, React는 함수를 자식으로 받으면 렌더 중 throw한다.
              // 현 말뭉치에서는 도달 불가다(토크나이저 /[A-Za-z]+.../ 가 밑줄을 못 만들어
              // `__proto__`가 불가능하고, 길이 3~10이 `constructor`(11자)를 끊으며, 나머지
              // 프로토타입 멤버는 전부 camelCase라 소문자 정규형과 일치하지 않는다).
              // 도달 불가를 근거로 두지 않는다 — 세 전제 중 하나만 바뀌어도 흰 화면이 된다.
              const meaning = Object.hasOwn(KO_MEANINGS, card.word)
                ? KO_MEANINGS[card.word]
                : FALLBACK_MEANING;

              // 재생 강조가 뒤집힘 표시보다 앞선다 — 지금 소리가 나는 카드가 무엇인지가
              // 더 급한 정보다. 뒤집힘은 글자가 한글로 바뀌는 것으로 이미 드러난다
              // (색 단독 전달이 아니다 — design-system.md:484).
              const tone = isPlaying
                ? 'border-primary bg-primary-container text-on-primary-container'
                : isFlipped
                  ? 'border-outline-strong bg-surface-3 text-text'
                  : 'border-outline bg-surface-2 text-text hover:bg-surface-3';

              return (
                // h-full — 스피커(44px)가 있는 카드와 없는 카드의 높이를 한 행에서 맞춘다.
                <li key={card.word} className="h-full">
                  {/* 카드 본체는 <button>이 아니다(D-D2 중첩 금지). 버튼과 동등한 조작성을
                      role·tabIndex·Enter/Space로 직접 갖춘다. */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-pressed={isFlipped}
                    aria-labelledby={faceId}
                    onClick={() => toggleFlip(card.word)}
                    onKeyDown={(e) => {
                      // 자손(스피커 버튼)에서 올라온 키는 처리하지 않는다. 이 확인을 빼면
                      // 스피커에 포커스가 있을 때 Enter가 재생과 뒤집기를 동시에 일으킨다 —
                      // 포인터 쪽 stopPropagation만으로는 막히지 않는 경로다(D-D2 주의 2).
                      if (e.target !== e.currentTarget) return;
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault(); // Space의 기본 스크롤 차단
                      toggleFlip(card.word);
                    }}
                    className={`${CARD_BASE} h-full w-full cursor-pointer select-none ${tone} ${
                      isFlipped ? 'scale-[0.98]' : 'scale-100'
                    }`}
                  >
                    {/* 발음 재생 불가 카드는 스피커만 없다 — 뒤집기는 그대로 제공한다(D-D3).
                        소리가 없다는 것과 뜻이 없다는 것은 다른 얘기다. */}
                    {card.playable && (
                      <button
                        type="button"
                        onClick={(e) => {
                          // 여기서 끊지 않으면 본체 토글이 함께 발화한다(D-D2 주의 1).
                          e.stopPropagation();
                          play(card);
                        }}
                        aria-label={`${card.word} 발음 듣기`}
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-pill transition-colors duration-200 ease-kiki hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none ${
                          isPlaying ? 'text-primary' : 'text-text-variant'
                        }`}
                      >
                        <Volume2 className="h-5 w-5" aria-hidden="true" />
                      </button>
                    )}
                    {/* 보이는 면만 DOM에 둔다 — aria-hidden을 쓰지 않으므로 화면낭독기가
                        뜻을 읽는다(D-D2). 본체의 aria-labelledby가 이 id를 가리켜,
                        중첩된 스피커의 aria-label이 본체 이름에 섞여 들어가지 않게 한다. */}
                    <span id={faceId} className="truncate">
                      {isFlipped ? meaning : card.word}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            {quizAvailable && (
              <button type="button" onClick={startQuiz} className={PRIMARY_BUTTON}>
                퀴즈 풀어보기
              </button>
            )}
            <Link href={exitHref} className={SECONDARY_BUTTON}>
              그만하기
            </Link>
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
            <Link href={exitHref} className={SECONDARY_BUTTON}>
              그만하기
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
