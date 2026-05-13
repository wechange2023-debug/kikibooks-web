import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// docs/design-system.md 6.1 — Primary 기본, pill 모양, 200ms easing.
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap font-semibold transition-colors duration-200 ease-kiki focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-[0.38]',
  {
    variants: {
      variant: {
        default: 'bg-primary text-on-primary shadow-elev-pop hover:bg-primary-hover',
        secondary: 'bg-secondary text-on-secondary hover:opacity-90',
        outline: 'border border-outline bg-surface text-text hover:bg-surface-2',
        ghost: 'text-text hover:bg-surface-2',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 rounded-pill px-[14px] text-sm',
        default: 'h-11 rounded-pill px-5 text-sm',
        lg: 'h-[52px] rounded-pill px-6 text-base',
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
