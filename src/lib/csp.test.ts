import { describe, it, expect } from 'vitest';
import { buildCsp } from './csp';

// This is the fix for a production incident: a static CSP with no nonce
// (previously set in next.config.ts) blocked every one of Next.js App
// Router's bare inline hydration <script> tags, so the page never rendered
// — eallsource.com and every preview deployment went blank. The nonce must
// be present in script-src and must match what gets embedded in the page's
// own script tags (Next.js does that part automatically once it sees a
// `nonce-` value in this header), and 'strict-dynamic' must be present so
// nonce'd scripts can load their own chunks.
describe('csp.buildCsp', () => {
  it('includes the given nonce in script-src', () => {
    const csp = buildCsp('abc123');
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic' https:");
  });

  it('produces a different policy string for a different nonce (proves it is per-request, not static)', () => {
    const cspA = buildCsp('aaaa');
    const cspB = buildCsp('bbbb');
    expect(cspA).not.toBe(cspB);
    expect(cspA).toContain('nonce-aaaa');
    expect(cspB).toContain('nonce-bbbb');
  });

  it('does not include a bare script-src \'self\' with no nonce (the regression this fixes)', () => {
    const csp = buildCsp('xyz');
    // "script-src 'self';" with nothing else would mean no nonce — assert
    // the directive actually contains a nonce token, not just the literal
    // string 'self' on its own.
    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src'));
    expect(scriptSrc).toContain('nonce-');
    expect(scriptSrc).toContain('strict-dynamic');
  });

  it('still scopes default-src and frame-ancestors to self', () => {
    const csp = buildCsp('n1');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
  });

  it('allows the Google Fonts stylesheet and font sources used in globals.css', () => {
    const csp = buildCsp('n1');
    expect(csp).toContain('https://fonts.googleapis.com');
    expect(csp).toContain('https://fonts.gstatic.com');
  });
});
