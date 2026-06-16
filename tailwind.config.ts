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
          bg:            '#ffffff',
          border:        '#e2e8f0',
          hover:         '#f8fafc',
          active:        '#3b82f6',
          text:          '#64748b',
          'text-active': '#ffffff',
        },
        surface: {
          DEFAULT: '#f1f5f9',
          card:    '#ffffff',
          border:  '#e2e8f0',
        },
      },
    },
  },
  plugins: [forms],
};

export default config;
