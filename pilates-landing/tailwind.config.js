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
        // Warm Editorial palette — single sage accent
        cream: '#FBF8F2',
        sand: '#F2EBDD',
        paper: '#FFFFFF',
        ink: '#1C1A16',
        mute: '#6E6A60',
        sage: {
          DEFAULT: '#5E6B4F',
          soft: '#7C896C',
          deep: '#434D38',
        },
        clay: '#B08763',
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
