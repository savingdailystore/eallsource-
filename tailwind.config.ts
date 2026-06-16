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
          50:  '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        sidebar: {
          bg:            '#141417',
          border:        '#27272a',
          hover:         '#1c1c1f',
          active:        '#7c3aed',
          text:          '#71717a',
          'text-active': '#ffffff',
        },
        surface: {
          DEFAULT: '#09090b',
          card:    '#18181b',
          border:  '#27272a',
        },
      },
    },
  },
  plugins: [forms],
};

export default config;
