/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#0d9467',
          700: '#0d7a4f',
          800: '#0b5f40',
          900: '#084c34',
          950: '#032e1f',
        },
        saffron: {
          50: '#fff8eb',
          100: '#ffedc6',
          200: '#ffd988',
          300: '#ffbf4a',
          400: '#ffa61f',
          500: '#f58300',
          600: '#d95f00',
          700: '#b44102',
          800: '#923208',
          900: '#78290b',
        },
        ink: {
          50: '#f7f6f2',
          100: '#ecebe4',
          200: '#d7d5ca',
          300: '#b8b5a7',
          400: '#918d7c',
          500: '#736f5f',
          600: '#5b584b',
          700: '#4a473d',
          800: '#3d3b33',
          900: '#26251f',
          950: '#151410',
        },
      },
      fontFamily: {
        sans: [
          'Mukta',
          'Noto Sans Devanagari',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        display: ['Baloo 2', 'Mukta', 'Noto Sans Devanagari', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(21,20,16,0.05), 0 8px 24px -12px rgba(21,20,16,0.18)',
        lift: '0 12px 40px -14px rgba(13,122,79,0.45)',
      },
      borderRadius: {
        '2.5xl': '1.35rem',
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pop': {
          '0%': { transform: 'scale(0.94)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(16,185,129,0.45)' },
          '70%': { boxShadow: '0 0 0 14px rgba(16,185,129,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(16,185,129,0)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fade-in 0.2s ease-out',
        pop: 'pop 0.18s ease-out',
        'pulse-ring': 'pulse-ring 1.6s infinite',
      },
      screens: {
        xs: '375px',
      },
    },
  },
  plugins: [],
}
