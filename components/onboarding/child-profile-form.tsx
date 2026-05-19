'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { registerChild } from '@/app/onboarding/actions';
import { Button } from '@/components/ui/button';
import {
  MAX_AGE,
  MAX_LEVEL,
  MIN_AGE,
  MIN_LEVEL,
  ageToRecommendedLevel,
  type ChildLevel,
} from '@/lib/levels/age-to-level';
import { cn } from '@/lib/utils';

/**
 * 자녀 프로필 입력 폼 — 이름·나이·레벨 (ADR-0011 결정 2·3·5).
 *
 * - 나이는 만 3~7세 버튼 5개. 나이를 고르면 레벨이 자동 추천된다(ADR-0011 §3).
 * - 레벨은 5개 레벨 컬러 버튼. 추천 레벨이 강조되며 학부모가 바꿀 수 있다.
 * - 색상 아바타는 이름 첫 글자 + 현재 레벨 컬러로 실시간 미리보기된다.
 * - 색·간격·폰트는 design-system.md semantic 토큰만 사용한다(Hard Rule 10).
 *
 * 사용자 흐름: docs/intent/onboarding-flow.md 4.1·4.3·4.4절
 */

const NAME_MAX = 20;

// design-system.md 1.8절 — 레벨 1~5 별칭. 색상은 Tailwind level-N 토큰(var(--level-N)).
// ★ Tailwind content 스캐너가 인식하도록 클래스명을 동적 조합하지 않고 문자열로 박제한다.
const LEVEL_META: { level: ChildLevel; alias: string; swatchClass: string }[] = [
  { level: 1, alias: '새싹', swatchClass: 'bg-level-1' },
  { level: 2, alias: '하늘', swatchClass: 'bg-level-2' },
  { level: 3, alias: '햇살', swatchClass: 'bg-level-3' },
  { level: 4, alias: '꽃', swatchClass: 'bg-level-4' },
  { level: 5, alias: '별', swatchClass: 'bg-level-5' },
];

// [3, 4, 5, 6, 7] — children.age CHECK 제약 범위.
const AGE_OPTIONS = Array.from(
  { length: MAX_AGE - MIN_AGE + 1 },
  (_, i) => MIN_AGE + i,
);

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '자녀 이름을 입력해 주세요.')
    .max(NAME_MAX, `이름은 ${NAME_MAX}자 이하로 입력해 주세요.`),
  age: z
    .number({ error: '자녀 나이를 선택해 주세요.' })
    .int()
    .min(MIN_AGE)
    .max(MAX_AGE),
  level: z
    .number({ error: '레벨을 선택해 주세요.' })
    .int()
    .min(MIN_LEVEL)
    .max(MAX_LEVEL),
});

type FormValues = z.infer<typeof formSchema>;

// 입력 필드 — signup-form.tsx와 동일 토큰 (design-system.md 3.2·4.2·6.2).
const fieldClass =
  'h-[52px] w-full rounded-pill border border-outline bg-surface px-[22px] text-sm text-text placeholder:text-text-disabled focus:border-primary focus:outline-none disabled:opacity-[0.38]';

export function ChildProfileForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '' },
  });

  // 나이·레벨은 커스텀 버튼으로 다루므로 명시적으로 등록한다 (input 미사용).
  register('age');
  register('level');

  const name = watch('name') ?? '';
  const age = watch('age');
  const level = watch('level');

  const recommendedLevel =
    typeof age === 'number' ? ageToRecommendedLevel(age) : null;
  const levelChangedFromRecommendation =
    recommendedLevel != null &&
    typeof level === 'number' &&
    level !== recommendedLevel;

  const trimmedName = name.trim();
  // 이모지를 surrogate pair 깨짐 없이 첫 글자만 — 코드포인트 단위 spread.
  const avatarChar = trimmedName ? [...trimmedName][0] : '?';
  const avatarSwatch =
    typeof level === 'number' ? LEVEL_META[level - 1].swatchClass : 'bg-surface-3';

  const handleAgeSelect = (selectedAge: number) => {
    setValue('age', selectedAge, { shouldValidate: true });
    // 나이를 고르면 추천 레벨을 자동 선택한다 (학부모가 이후 바꿀 수 있다).
    setValue('level', ageToRecommendedLevel(selectedAge), {
      shouldValidate: true,
    });
  };

  const handleLevelSelect = (selectedLevel: ChildLevel) => {
    setValue('level', selectedLevel, { shouldValidate: true });
  };

  const onSubmit = (values: FormValues) => {
    setFormError(null);
    startTransition(async () => {
      try {
        // 성공 시 서버 액션이 /home으로 리다이렉트한다.
        const result = await registerChild({
          name: values.name,
          age: values.age,
          level: values.level,
        });
        if (result && 'error' in result) {
          setFormError(result.error);
        }
      } catch {
        setFormError(
          '자녀 정보를 저장하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        );
      }
    });
  };

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
    >
      {/* 색상 아바타 실시간 미리보기 */}
      <div className="flex flex-col items-center gap-2">
        <div
          aria-hidden="true"
          className={cn(
            'flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold text-text transition-colors',
            avatarSwatch,
          )}
        >
          {avatarChar}
        </div>
        <p className="text-xs text-text-variant">
          {trimmedName
            ? `${trimmedName}의 프로필`
            : '이름을 입력하면 미리보기가 보여요'}
        </p>
      </div>

      {/* 이름 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="child-name" className="text-sm font-medium text-text">
            자녀 이름
          </label>
          <span className="text-xs text-text-variant" aria-hidden="true">
            {name.length} / {NAME_MAX}
          </span>
        </div>
        <input
          id="child-name"
          type="text"
          maxLength={NAME_MAX}
          autoComplete="off"
          placeholder="예: 키키, Kiki"
          className={fieldClass}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'child-name-error' : undefined}
          disabled={isPending}
          {...register('name')}
        />
        {errors.name && (
          <p id="child-name-error" className="text-sm font-medium text-error">
            {errors.name.message}
          </p>
        )}
      </div>

      {/* 나이 */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-text">자녀 나이 (만)</span>
        <div className="flex gap-2" role="group" aria-label="자녀 나이 선택">
          {AGE_OPTIONS.map((ageOption) => {
            const selected = age === ageOption;
            return (
              <button
                key={ageOption}
                type="button"
                onClick={() => handleAgeSelect(ageOption)}
                aria-pressed={selected}
                disabled={isPending}
                className={cn(
                  'flex-1 rounded-md border py-3 text-base font-semibold transition-colors disabled:opacity-[0.38]',
                  selected
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-outline bg-surface text-text hover:bg-surface-2',
                )}
              >
                {ageOption}세
              </button>
            );
          })}
        </div>
        {errors.age && (
          <p className="text-sm font-medium text-error">{errors.age.message}</p>
        )}
      </div>

      {/* 레벨 */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-text">읽기 레벨</span>
        {recommendedLevel != null ? (
          <p className="text-sm text-text-variant">
            만 {age}세 →{' '}
            <span className="font-semibold text-text">
              Level {recommendedLevel} {LEVEL_META[recommendedLevel - 1].alias}
            </span>{' '}
            추천
          </p>
        ) : (
          <p className="text-sm text-text-variant">
            나이를 선택하면 레벨이 자동으로 추천돼요
          </p>
        )}
        <div className="flex gap-2" role="group" aria-label="읽기 레벨 선택">
          {LEVEL_META.map((meta) => {
            const selected = level === meta.level;
            const recommended = recommendedLevel === meta.level;
            return (
              <button
                key={meta.level}
                type="button"
                onClick={() => handleLevelSelect(meta.level)}
                aria-pressed={selected}
                disabled={isPending}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 rounded-md border p-2 transition-colors disabled:opacity-[0.38]',
                  selected
                    ? 'border-primary bg-surface-2'
                    : 'border-outline bg-surface hover:bg-surface-2',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-text',
                    meta.swatchClass,
                  )}
                >
                  {meta.level}
                </span>
                <span className="text-xs font-medium text-text">
                  {meta.alias}
                </span>
                {/* 추천 라벨 — 자리를 항상 차지해 선택 시 레이아웃이 흔들리지 않게 한다. */}
                <span
                  className={cn(
                    'text-xs font-semibold',
                    recommended ? 'text-primary' : 'text-transparent',
                  )}
                >
                  추천
                </span>
              </button>
            );
          })}
        </div>
        {levelChangedFromRecommendation && (
          <p className="text-xs text-text-variant">
            추천 레벨에서 직접 변경했어요. 언제든 다시 바꿀 수 있어요.
          </p>
        )}
        {errors.level && (
          <p className="text-sm font-medium text-error">
            {errors.level.message}
          </p>
        )}
      </div>

      {formError && (
        <p
          role="alert"
          className="rounded-md border border-outline bg-surface-2 px-4 py-3 text-sm font-medium text-error"
        >
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? '저장 중…' : '시작하기'}
      </Button>
    </form>
  );
}
