'use client';

import { useMemo } from 'react';

import { type HighlightUnit } from '@/lib/book/highlight-config';

/**
 * HighlightedText — 자막 텍스트를 단어 span으로 그리고 활성 단어(또는 문장)를 강조한다.
 *
 * marks(speech marks)의 start/end는 **정규화 텍스트**(generate_tts.py normalize_text 결과)의
 * 문자 오프셋이다. 여기서 동일 규칙으로 원문을 정규화한 뒤 오프셋으로 슬라이스하므로
 * 강조 span이 실제 낭독 단어와 정확히 일치한다(문장부호·공백 보존).
 *
 * 하이라이트 단위는 lib/book/highlight-config.ts의 HIGHLIGHT_UNIT로 전환한다(ADR-0052 D7):
 *   - 'word'     : activeIndex 단어 1개만 강조.
 *   - 'sentence' : activeIndex 단어가 속한 문장 전체 강조.
 *
 * 강조 시각: accent 토큰 배경 칠(bg-accent-yellow), 밑줄 아님(팀장 확정). raw 색상값 0(Hard Rule 10).
 */

/** generate_tts.py speech marks 1행(word). */
export interface WordMark {
  /** 재생 위치(ms). */
  time: number;
  /** 단어 문자열. */
  value: string;
  /** 정규화 텍스트 내 시작 오프셋. */
  start: number;
  /** 정규화 텍스트 내 끝 오프셋(배타적). */
  end: number;
}

interface HighlightedTextProps {
  /** 페이지 원문(book_text.text, trim됨). */
  text: string;
  /** 단어 타임스탬프. 비어 있으면 평문만 렌더. */
  marks: WordMark[];
  /** 현재 활성 mark 인덱스. -1 = 활성 없음(재생 전/사이 간격). */
  activeIndex: number;
  /** 강조 단위. */
  unit: HighlightUnit;
  className?: string;
}

// generate_tts.py normalize_text 포트: [.!?] 뒤 공백 없이 따옴표/대문자가 오면 공백 1칸 삽입.
// 커브 따옴표 포함(원문과 동일 문자군). 소수점·줄임표는 다음 문자 한정으로 건드리지 않음.
const PUNCT_GAP_RE = /([.!?])(?=[“”‘’"'A-Z])/g;

function normalizeText(text: string): string {
  return text.replace(PUNCT_GAP_RE, '$1 ');
}

// 문장 종결부호 ASCII 바이트: '.'=46 '!'=33 '?'=63 (모두 단일바이트).
const SENTENCE_TERMINATOR_BYTES = new Set([46, 33, 63]);

/**
 * 각 mark가 속한 문장 id — 정규화 텍스트의 시작 **바이트 오프셋** 앞의 [.!?] 개수.
 * mark.start가 UTF-8 바이트 오프셋이므로 바이트 배열에서 센다(P1-A). sentence 단위 강조용.
 */
function sentenceIds(bytes: Uint8Array, marks: WordMark[]): number[] {
  return marks.map((m) => {
    const end = Math.min(m.start, bytes.length);
    let count = 0;
    for (let i = 0; i < end; i++) {
      if (SENTENCE_TERMINATOR_BYTES.has(bytes[i])) count++;
    }
    return count;
  });
}

interface Segment {
  gap: string;
  word: string;
  markIndex: number;
}

export function HighlightedText({
  text,
  marks,
  activeIndex,
  unit,
  className,
}: HighlightedTextProps) {
  const normalized = useMemo(() => normalizeText(text), [text]);
  // speech marks의 start/end는 정규화 텍스트의 **UTF-8 바이트** 오프셋이다(P1-A).
  // JS 문자 인덱스로 슬라이스하면 멀티바이트 문자(커브따옴표 등) 뒤로 누적 이탈하므로
  // 바이트 배열을 슬라이스한 뒤 디코드해 단어/간격을 만든다.
  const bytes = useMemo(() => new TextEncoder().encode(normalized), [normalized]);

  const segments = useMemo<Segment[]>(() => {
    const decoder = new TextDecoder();
    const segs: Segment[] = [];
    let cursor = 0;
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      // 오프셋이 어긋난 mark(범위 밖)는 건너뛴다(방어적).
      if (m.start < cursor || m.end > bytes.length || m.start >= m.end) {
        continue;
      }
      segs.push({
        gap: decoder.decode(bytes.slice(cursor, m.start)),
        word: decoder.decode(bytes.slice(m.start, m.end)),
        markIndex: i,
      });
      cursor = m.end;
    }
    // 마지막 단어 이후 꼬리 텍스트.
    segs.push({ gap: decoder.decode(bytes.slice(cursor)), word: '', markIndex: -1 });
    return segs;
  }, [bytes, marks]);

  const sIds = useMemo(() => sentenceIds(bytes, marks), [bytes, marks]);
  const activeSentence =
    activeIndex >= 0 && activeIndex < sIds.length ? sIds[activeIndex] : -1;

  // marks가 없으면(로드 실패·빈 면) 평문만 렌더.
  if (marks.length === 0) {
    return <p className={className}>{normalized}</p>;
  }

  return (
    <p className={className}>
      {segments.map((seg, idx) => {
        const isActive =
          seg.markIndex >= 0 &&
          (unit === 'word'
            ? seg.markIndex === activeIndex
            : activeSentence >= 0 && sIds[seg.markIndex] === activeSentence);
        return (
          <span key={idx}>
            {seg.gap}
            {seg.word && (
              <span
                className={
                  isActive
                    ? 'rounded-[0.2em] bg-accent-yellow px-[0.08em] text-text transition-colors duration-150 ease-kiki'
                    : 'transition-colors duration-150 ease-kiki'
                }
              >
                {seg.word}
              </span>
            )}
          </span>
        );
      })}
    </p>
  );
}
