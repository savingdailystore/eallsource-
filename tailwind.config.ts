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
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        sidebar: {
          bg:            '#18181b',
          border:        '#27272a',
          hover:         '#27272a',
          active:        '#ea580c',
          text:          '#a1a1aa',
          'text-active': '#ffffff',
        },
        surface: {
          DEFAULT: '#f5f5f4',
          card:    '#ffffff',
          border:  '#e7e5e4',
        },
      },
    },
  },
  plugins: [forms],
};

export default config;
