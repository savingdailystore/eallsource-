import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'EALLsource — Amazon OA Sourcing Platform',
  description:
    'Find profitable Amazon Online Arbitrage opportunities automatically. ROI tracking, IP risk analysis, BSR filtering, and weekly product feeds.',
  keywords: 'amazon arbitrage, online arbitrage, fba sourcing, roi calculator, keepa',
};

// Inline script runs before React hydration to avoid flash of wrong theme
const themeScript = `
  (function() {
    try {
      var t = localStorage.getItem('theme');
      if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      if (t === 'dark') document.documentElement.classList.add('dark');
    } catch(e) {}
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={inter.className}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
