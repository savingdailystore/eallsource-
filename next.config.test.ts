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
    expect(byKey['Content-Security-Policy']).toContain("default-src 'self'");
    expect(byKey['Content-Security-Policy']).toContain("frame-ancestors 'self'");
  });
});
