import NextAuth from 'next-auth';
import { NextResponse, type NextRequest } from 'next/server';
import { authConfig } from '@/lib/auth.config';
import { buildCsp } from '@/lib/csp';

// Use the Edge-safe config directly rather than importing `auth` from
// @/lib/auth — that file pulls in Prisma, bcrypt, and the Redis-backed rate
// limiter, none of which can run in the Edge runtime this middleware uses.
// This instance only ever reads/validates the existing session JWT (via the
// jwt/session callbacks in auth.config.ts); it never needs the credentials
// provider, since middleware never calls signIn().
const { auth } = NextAuth(authConfig);

// Auth pages: visible only when signed out — an authed user is bounced to the
// dashboard so they don't see the login/register screens again.
const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

// Marketing / legal pages: visible to everyone, signed in or not. Amazon's
// SP-API review and Stripe both require these to be publicly reachable.
const OPEN_PATHS = ['/privacy', '/terms', '/contact'];

// CSP must be generated here (not in next.config.ts) with a per-request
// nonce — see src/lib/csp.ts for why. A static CSP with no nonce took the
// live site down once already (the page never hydrates and renders blank).
function withCsp(res: NextResponse, csp: string): NextResponse {
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export default auth((req) => {
  // crypto.getRandomValues is a standard Web Crypto API, available in the
  // Edge runtime — Buffer is NOT, so a hex string (not base64) is used here.
  // The CSP spec doesn't require base64 for a nonce value, only that it be
  // unguessable and match between the header and the script tag.
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  const csp   = buildCsp(nonce);

  const requestHeaders = new Headers((req as NextRequest).headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const next = () => withCsp(NextResponse.next({ request: { headers: requestHeaders } }), csp);

  const { pathname } = req.nextUrl;
  const isAuthed = !!req.auth;

  // API routes must never be redirected. They guard themselves (returning
  // 401 JSON when needed) and are called via fetch(), which silently follows
  // a 307 and returns HTML — that broke the login mfa-check, surfacing as a
  // bogus "Invalid email or password." Let every /api request through.
  if (pathname.startsWith('/api')) {
    return next();
  }

  // The landing page (root) is public; it redirects authed users to the
  // dashboard itself, in the page component.
  if (pathname === '/') {
    return next();
  }

  // Always-public pages — never redirect, regardless of auth state.
  if (OPEN_PATHS.some((p) => pathname.startsWith(p))) {
    return next();
  }

  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p));

  if (isAuthPage && isAuthed) {
    return withCsp(NextResponse.redirect(new URL('/dashboard', req.nextUrl)), csp);
  }

  if (!isAuthPage && !isAuthed) {
    const url = new URL('/login', req.nextUrl);
    url.searchParams.set('callbackUrl', pathname);
    return withCsp(NextResponse.redirect(url), csp);
  }

  return next();
});

export const config = {
  // Exclude static assets, images, and the Stripe webhook (must receive raw body)
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/billing/webhook).*)'],
};
