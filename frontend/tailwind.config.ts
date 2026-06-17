import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        spire: {
          50:  '#fdf4e7',
          100: '#fbe3bc',
          200: '#f8cc86',
          300: '#f5b04f',
          400: '#f29829',
          500: '#e07d12',
          600: '#b8620d',
          700: '#8f4b0b',
          800: '#66340a',
          900: '#3d1e08',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
