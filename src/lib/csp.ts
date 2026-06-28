/**
 * Builds the per-request Content-Security-Policy string used by
 * src/middleware.ts. Kept in its own module, free of any Next.js/NextAuth
 * imports, so it can be unit-tested in isolation without pulling in the
 * Edge runtime module graph.
 *
 * Why this needs a nonce at all: the App Router renders its own
 * hydration/RSC-streaming code as bare inline <script> tags on every page —
 * there is no way to avoid that, it's how Next.js works. A `script-src
 * 'self'` CSP with no nonce blocks every one of those inline scripts, so the
 * page never hydrates and renders blank — this took the live site down
 * right after a static CSP was first added in next.config.ts, because that
 * approach has no way to vary the nonce per request. Next.js auto-detects a
 * `nonce-` value in the CSP response header and applies it to its own
 * injected scripts; 'strict-dynamic' lets those nonce'd scripts load their
 * own chunks without listing every script URL, and the `https:` fallback is
 * for browsers old enough not to support strict-dynamic/nonces (they ignore
 * strict-dynamic and use the fallback instead — both directives only do
 * anything in browsers that don't support the other, per the CSP3 spec).
 */
export function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}
