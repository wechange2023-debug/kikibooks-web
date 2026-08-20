import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * docs/design-system.md v2 §6.1 — pill 모양, 200ms easing.
 *
 * 위계: cta → default(Primary) → secondary(primary 외곽선) → outline → ghost → link.
 *
 * ★ `cta`(오렌지레드)는 **화면당 1개**다(§1.2). 기본값은 여전히 `default`(딥 그린)이며,
 *   CTA로 쓸 버튼만 호출부에서 `variant="cta"`를 명시한다 — default를 CTA로 바꾸면
 *   호출부 6곳이 한꺼번에 CTA가 되어 랜딩에 CTA가 2개 생긴다(§6.1 위반).
 *
 * 에러·복구 화면(not-found·admin/error·global-error·auth-error)의 복귀 버튼은
 * `default`를 유지한다 — error(#B3261E)와 cta(#CE3D1A)가 육안으로 가까워(§1.6)
 * 오류 화면에서 가장 혼동되기 쉽다. 팀장 확정 2026-08-19.
 *
 * focus 링은 base의 ring-primary/50을 variant가 덮어쓴다(cn = twMerge, 후행 우선).
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap font-semibold transition-colors duration-200 ease-kiki focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-[0.38]',
  {
    variants: {
      variant: {
        cta: 'bg-cta text-on-cta shadow-elev-cta hover:bg-cta-hover focus-visible:ring-cta/50',
        default: 'bg-primary text-on-primary shadow-elev-2 hover:bg-primary-hover',
        secondary:
          'border-2 border-primary bg-surface text-primary hover:bg-primary-container',
        outline: 'border border-outline bg-surface text-text hover:bg-surface-2',
        ghost: 'text-text hover:bg-surface-2',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 rounded-pill px-[14px] text-label',
        default: 'h-11 rounded-pill px-5 text-label',
        lg: 'h-[52px] rounded-pill px-6 text-body',
        icon: 'h-10 w-10 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
