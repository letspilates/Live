/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Pretendard', 'Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'Pretendard', 'ui-sans-serif', 'sans-serif'],
      },
      colors: {
        // Warm Editorial palette — single sage accent. Values live in src/index.css
        // (:root) so the admin portal can swap them for dark mode; same colors.
        cream: 'rgb(var(--c-cream) / <alpha-value>)',
        sand: 'rgb(var(--c-sand) / <alpha-value>)',
        paper: 'rgb(var(--c-paper) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        mute: 'rgb(var(--c-mute) / <alpha-value>)',
        sage: {
          DEFAULT: 'rgb(var(--c-sage) / <alpha-value>)',
          soft: 'rgb(var(--c-sage-soft) / <alpha-value>)',
          deep: 'rgb(var(--c-sage-deep) / <alpha-value>)',
        },
        clay: 'rgb(var(--c-clay) / <alpha-value>)',
        // Admin portal only (values in src/admin/admin.css).
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--c-shadow) / 0.05), 0 8px 24px -12px rgb(var(--c-shadow) / 0.12)',
        pop: '0 16px 40px -8px rgb(var(--c-shadow) / 0.22), 0 2px 6px rgb(var(--c-shadow) / 0.06)',
      },
      letterSpacing: {
        tightest: '-0.045em',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
