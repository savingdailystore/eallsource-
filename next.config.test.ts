import { describe, it, expect } from 'vitest';
import config from './next.config';

describe('next.config security headers', () => {
  it('defines a headers() function', () => {
    expect(typeof config.headers).toBe('function');
  });

  it('applies the expected security headers to every route', async () => {
    const rules = await config.headers!();
    expect(rules).toHaveLength(1);
    const { source, headers } = rules[0];
    expect(source).toBe('/:path*');

    const byKey = Object.fromEntries(headers.map((h) => [h.key, h.value]));
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
    expect(byKey['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(byKey['Strict-Transport-Security']).toContain('max-age=31536000');
  });

  it('does NOT set a static Content-Security-Policy here', async () => {
    // CSP needs a fresh nonce per request to allow Next.js App Router's
    // inline hydration scripts to run — a static CSP here with no nonce
    // blocks them and renders every page blank (this happened in
    // production once already). It must come from src/middleware.ts
    // instead, generated per-request — see src/middleware.test.ts.
    const rules = await config.headers!();
    const keys  = rules[0].headers.map((h) => h.key);
    expect(keys).not.toContain('Content-Security-Policy');
  });
});
