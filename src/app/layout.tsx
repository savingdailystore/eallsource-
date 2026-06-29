import type { Metadata } from 'next';
import './globals.css';

// Forces every route to render per-request rather than being statically
// prerendered at build time. Required because src/middleware.ts mints a
// fresh CSP nonce on every request — a statically prerendered page bakes in
// whatever nonce existed at build time, which never matches the per-request
// nonce in the response header, so every inline/hydration script on that
// page gets blocked (this is what broke /login: it has no server data
// fetching, so Next static-optimized it). This is Next.js's own documented
// fix for nonce-based CSP. See src/lib/csp.ts for the CSP itself.
export const dynamic = 'force-dynamic';

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
