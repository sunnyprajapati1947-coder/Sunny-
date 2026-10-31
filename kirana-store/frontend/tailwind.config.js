/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#fff7ed', 100: '#ffedd5', 500: '#f97316', 600: '#ea580c', 700: '#c2410c', 900: '#7c2d12' },
        ink: { 900: '#0b1220', 800: '#111a2e', 700: '#1a2540' },
      },
      boxShadow: { card: '0 1px 3px rgb(0 0 0 / .08), 0 8px 24px -12px rgb(0 0 0 / .18)' },
    },
  },
  plugins: [],
};
