import type { Config } from 'tailwindcss';

// Ayu Mirage color system
// bg: #1f2430  panel: #242936  border: #2d3548  muted: #5c6773  text: #ccc8c0
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Remap gray → Ayu Mirage blue-grey scale
        gray: {
          50:  '#e6e1cf',  // brightest text
          100: '#d9d7ce',  // primary text
          200: '#c8c4bb',  // regular text / Common card color
          300: '#a6b0c3',  // secondary text
          400: '#707a8c',  // muted text
          500: '#5c6773',  // very muted / comments
          600: '#3d4a5c',  // inactive UI / scrollbar
          700: '#2d3548',  // borders elevated
          800: '#242936',  // card / panel bg
          900: '#1f2430',  // main bg / header
          950: '#1a1f29',  // deepest bg / body
        },
        // Spire accent → Ayu Mirage amber/orange
        spire: {
          50:  '#fff8ec',
          100: '#ffebc8',
          200: '#ffd68f',
          300: '#ffc45c',
          400: '#ffb454',  // Ayu primary accent
          500: '#ffa040',
          600: '#e8882a',  // button bg
          700: '#c47020',
          800: '#8f5018',
          900: '#5a3210',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
