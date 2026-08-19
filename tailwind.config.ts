import type { Config } from 'tailwindcss';

// docs/design-system.md v2 §10.2 매핑 — semantic 토큰만 노출 (raw HEX 직접 사용은
// CLAUDE.md Hard Rule 10 위반). 중첩 객체({ DEFAULT, hover })를 쓰지 않는다 — 평면 키다.
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
        // §1.1 Primary — 딥 그린(브랜드·구조). CTA 아님
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        'on-primary': 'var(--color-on-primary)',
        'primary-container': 'var(--color-primary-container)',
        'on-primary-container': 'var(--color-on-primary-container)',

        // §1.2 CTA — 오렌지레드(행동 유도 전용, 화면당 1개)
        cta: 'var(--color-cta)',
        'cta-hover': 'var(--color-cta-hover)',
        'on-cta': 'var(--color-on-cta)',
        'cta-container': 'var(--color-cta-container)',
        'on-cta-container': 'var(--color-on-cta-container)',

        // §1.3 Accent — 프로모·카테고리. 머스터드 위 흰 글자 금지
        'accent-purple': 'var(--color-accent-purple)',
        'accent-mustard': 'var(--color-accent-mustard)',
        'on-accent-mustard': 'var(--color-on-accent-mustard)',

        // §1.4 Background / Surface
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        'surface-3': 'var(--color-surface-3)',
        outline: 'var(--color-outline)',
        'outline-strong': 'var(--color-outline-strong)',

        // §1.5 Text
        text: 'var(--color-text)',
        'text-variant': 'var(--color-text-variant)',
        'text-disabled': 'var(--color-text-disabled)',
        'text-inverse': 'var(--color-text-inverse)',

        // §1.6 Semantic
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',
        info: 'var(--color-info)',

        // §1.7 자녀 레벨 — 기본색은 스트로크/도트, 라벨은 container + text
        'level-1': 'var(--level-1)',
        'level-1-container': 'var(--level-1-container)',
        'level-2': 'var(--level-2)',
        'level-2-container': 'var(--level-2-container)',
        'level-3': 'var(--level-3)',
        'level-3-container': 'var(--level-3-container)',
        'level-4': 'var(--level-4)',
        'level-4-container': 'var(--level-4-container)',
        'level-5': 'var(--level-5)',
        'level-5-container': 'var(--level-5-container)',
      },
      fontFamily: {
        // §2.1 — Display는 Gothic A1 단독(한글·라틴 동일 서체).
        display: ['var(--font-display)', 'Pretendard', 'system-ui', 'sans-serif'],
        // Body는 라틴 PJS + 한글 Gothic A1(글리프 단위 폴백). next/font의 fallback
        // 옵션은 정적 문자열만 받아 다른 폰트의 생성 패밀리명을 참조할 수 없으므로,
        // §2.1이 규정한 합성 스택을 여기서 구성한다.
        body: [
          'var(--font-body)',
          'var(--font-display)',
          'Pretendard',
          'system-ui',
          'sans-serif',
        ],
        mono: ['var(--font-mono)'],
      },
      // §2.2 Type Scale 7종 — [size, { lineHeight, fontWeight }]
      // fontWeight는 기본값이며, font-* 유틸리티가 뒤에 생성되어 이를 덮어쓴다.
      fontSize: {
        display: ['36px', { lineHeight: '41px', fontWeight: '700' }],
        h1: ['28px', { lineHeight: '34px', fontWeight: '700' }],
        h2: ['22px', { lineHeight: '28px', fontWeight: '700' }],
        h3: ['18px', { lineHeight: '23px', fontWeight: '600' }],
        body: ['16px', { lineHeight: '26px', fontWeight: '400' }],
        label: ['14px', { lineHeight: '20px', fontWeight: '500' }],
        caption: ['12px', { lineHeight: '17px', fontWeight: '600' }],
      },
      // §4.1 — xs(8px) 폐기(사용 0건), md/lg/xl 상향. none은 정의하지 않는다(§0 원칙 2)
      borderRadius: {
        sm: '12px',
        md: '20px',
        lg: '28px',
        xl: '36px',
        pill: '9999px',
      },
      // §5.1 — CSS 변수를 거치지 않고 리터럴 값을 직접 둔다. elev-pop → elev-cta 개명
      boxShadow: {
        'elev-1': '0 1px 2px rgba(20,15,10,.06), 0 2px 6px rgba(20,15,10,.04)',
        'elev-2': '0 4px 12px rgba(20,15,10,.08), 0 1px 3px rgba(20,15,10,.06)',
        'elev-3': '0 8px 20px rgba(20,15,10,.10), 0 2px 6px rgba(20,15,10,.06)',
        'elev-cta': '0 12px 28px rgba(206,61,26,.22), 0 4px 10px rgba(20,15,10,.06)',
        'elev-modal': '0 30px 80px rgba(20,15,10,.18), 0 8px 24px rgba(20,15,10,.10)',
      },
      transitionTimingFunction: {
        // §6.2 Card transition + §7.5 Celebrate bounce
        kiki: 'cubic-bezier(0.2, 0, 0, 1)',
        'kiki-bounce': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      // spacing 확장 없음 — Tailwind 기본 스케일 사용 (§3.1).
      // v1의 7/10/12/16 확장은 Tailwind 기본값(1.75rem/2.5rem/3rem/4rem)과 완전히
      // 동일해 아무 효과가 없었다. 삭제한다.
    },
  },
  plugins: [],
};

export default config;
