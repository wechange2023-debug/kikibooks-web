'use client';

import { useState, useTransition } from 'react';

import { updateChildLevel } from '@/lib/home/actions';
import type { HomeCopy } from '@/lib/home/copy';
import { cn } from '@/lib/utils';

/**
 * 자녀 레벨 선택 바 — Level 1~5 Chip 5개.
 *
 * 책임: 활성 레벨 표시 + 다른 레벨 클릭 시 server action 호출 + 옵티미스틱 UI +
 * 실패 시 롤백 + 인라인 에러 메시지.
 *
 * 디자인 인용:
 *   - design-system §3 Chip — h-[38px] + px-4 + rounded-pill (D11 임의 픽셀 1건)
 *   - design-system §1.8 자녀 레벨 매핑 — Level 1~5 → bg-level-1~5 정적 매핑
 *   - design-system §6.2 표면 위 표면 — border-outline 1px (비활성 Chip)
 *
 * D18 (cp3_decisions):
 *   - useState(activeLevel) — 옵티미스틱 활성 레벨
 *   - useState(error) — 에러 메시지 표시
 *   - useTransition — server action 진행 상태
 *   - server action 실패 시 활성 레벨을 이전 값으로 롤백 + error 메시지 표시
 *   - sonner 토스트 미사용 (phase-11 이후 도입). actions.ts 반환값 그대로 표시
 *     (HOME_COPY.levelSelector.error 신규 추가 안 함)
 *
 * D11 (cp3_decisions): 레벨별 클래스 = LEVEL_SWATCH_CLASSES 정적 매핑.
 *   동적 조합(`bg-level-${level}`) 금지 — Tailwind content 스캐너 인식 보장.
 *
 * Client Component — useState + useTransition + server action 호출.
 */

interface LevelSelectorProps {
  childId: string;
  currentLevel: number;
  copy: HomeCopy['levelSelector'];
}

/** Level 1~5 Chip 메타. design-system §1.8 별칭 + bg-level-N 정적 클래스. */
const LEVEL_META: { level: number; alias: string; swatchClass: string }[] = [
  { level: 1, alias: '새싹', swatchClass: 'bg-level-1' },
  { level: 2, alias: '하늘', swatchClass: 'bg-level-2' },
  { level: 3, alias: '햇살', swatchClass: 'bg-level-3' },
  { level: 4, alias: '꽃', swatchClass: 'bg-level-4' },
  { level: 5, alias: '별', swatchClass: 'bg-level-5' },
];

export function LevelSelector({ childId, currentLevel, copy }: LevelSelectorProps) {
  const [activeLevel, setActiveLevel] = useState(currentLevel);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSelect = (newLevel: number) => {
    if (newLevel === activeLevel || isPending) {
      return;
    }
    const previousLevel = activeLevel;
    setActiveLevel(newLevel); // 옵티미스틱
    setError(null);

    startTransition(async () => {
      const result = await updateChildLevel({ childId, newLevel });
      if (!result.ok) {
        setActiveLevel(previousLevel); // 롤백
        setError(result.error);
      }
    });
  };

  return (
    <section
      aria-label={copy.title}
      className="flex flex-col gap-3 rounded-md bg-surface p-5 shadow-elev-1"
    >
      <h2 className="font-display text-base font-semibold text-text">{copy.title}</h2>

      <div
        role="group"
        aria-label={copy.title}
        className="flex flex-wrap gap-2"
      >
        {LEVEL_META.map((meta) => {
          const selected = activeLevel === meta.level;
          return (
            <button
              key={meta.level}
              type="button"
              onClick={() => handleSelect(meta.level)}
              aria-pressed={selected}
              disabled={isPending}
              className={cn(
                'inline-flex h-[38px] items-center gap-2 rounded-pill border px-4 text-sm font-medium transition-colors disabled:opacity-[0.38]',
                selected
                  ? 'border-primary bg-surface-2 text-text'
                  : 'border-outline bg-surface text-text-variant hover:bg-surface-2',
              )}
            >
              <span
                aria-hidden="true"
                className={cn('h-3 w-3 rounded-full', meta.swatchClass)}
              />
              Level {meta.level} · {meta.alias}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-error">
          {error}
        </p>
      )}
    </section>
  );
}
