import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'EALLsource', template: '%s · EALLsource' },
  description: 'Amazon FBA arbitrage sourcing platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
