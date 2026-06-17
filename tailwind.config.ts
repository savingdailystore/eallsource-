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
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        sidebar: {
          bg:            '#0f172a',
          border:        '#1e293b',
          hover:         '#1e293b',
          active:        '#3b82f6',
          text:          '#94a3b8',
          'text-active': '#ffffff',
        },
        surface: {
          DEFAULT: '#020617',
          card:    '#0f172a',
          border:  '#1e293b',
        },
      },
    },
  },
  plugins: [forms],
};

export default config;
