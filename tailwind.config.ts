import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        brand: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea6910',
          700: '#c2560d',
          800: '#9a440a',
          900: '#7c3a0a',
        },
        sidebar: {
          bg:            '#0d0d0d',
          border:        '#2a2a2a',
          hover:         '#1c1c1c',
          active:        '#f97316',
          text:          '#6b7280',
          'text-active': '#ffffff',
        },
        surface: {
          DEFAULT: '#111111',
          card:    '#1c1c1c',
          border:  '#2a2a2a',
        },
      },
    },
  },
  plugins: [forms],
};

export default config;
