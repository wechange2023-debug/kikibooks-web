import type { Config } from 'tailwindcss';

// docs/design-system.md 10.1절 매핑 — semantic 토큰만 노출 (raw HEX 직접 사용은 Hard Rule 10번 위반).
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 1.1 Primary
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        'on-primary': 'var(--color-on-primary)',
        'primary-container': 'var(--color-primary-container)',
        'on-primary-container': 'var(--color-on-primary-container)',

        // 1.2 Secondary
        secondary: 'var(--color-secondary)',
        'on-secondary': 'var(--color-on-secondary)',
        'secondary-container': 'var(--color-secondary-container)',
        'on-secondary-container': 'var(--color-on-secondary-container)',

        // 1.3 Tertiary
        tertiary: 'var(--color-tertiary)',
        'on-tertiary': 'var(--color-on-tertiary)',
        'tertiary-container': 'var(--color-tertiary-container)',
        'on-tertiary-container': 'var(--color-on-tertiary-container)',

        // 1.4 Accent (카테고리·콘텐츠 식별용 — CTA 사용 금지)
        'accent-yellow': 'var(--color-accent-yellow)',
        'accent-pink': 'var(--color-accent-pink)',
        'accent-violet': 'var(--color-accent-violet)',
        'accent-green': 'var(--color-accent-green)',
        'accent-sky': 'var(--color-accent-sky)',

        // 1.5 Background / Surface
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        'surface-3': 'var(--color-surface-3)',
        outline: 'var(--color-outline)',

        // 1.6 Text
        text: 'var(--color-text)',
        'text-variant': 'var(--color-text-variant)',
        'text-disabled': 'var(--color-text-disabled)',
        'text-inverse': 'var(--color-text-inverse)',

        // 1.7 Semantic
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',
        info: 'var(--color-info)',

        // 1.8 자녀 레벨 매핑 (Level 1~5)
        'level-1': 'var(--level-1)',
        'level-2': 'var(--level-2)',
        'level-3': 'var(--level-3)',
        'level-4': 'var(--level-4)',
        'level-5': 'var(--level-5)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      spacing: {
        // Tailwind 기본 스케일에 없는 값만 추가 (4px base와 일치)
        '7': '28px',
        '10': '40px',
        '12': '48px',
        '16': '64px',
      },
      borderRadius: {
        xs: '8px',
        sm: '12px',
        md: '16px',
        lg: '24px',
        xl: '28px',
        pill: '9999px',
      },
      boxShadow: {
        'elev-1': 'var(--elevation-1)',
        'elev-2': 'var(--elevation-2)',
        'elev-3': 'var(--elevation-3)',
        'elev-pop': 'var(--elevation-pop)',
        'elev-modal': 'var(--elevation-modal)',
      },
      transitionTimingFunction: {
        // 6.2 Card transition + 7.3 Celebrate bounce
        kiki: 'cubic-bezier(0.2, 0, 0, 1)',
        'kiki-bounce': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
