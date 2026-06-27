import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

// Auth pages: visible only when signed out — an authed user is bounced to the
// dashboard so they don't see the login/register screens again.
const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

// Marketing / legal pages: visible to everyone, signed in or not. Amazon's
// SP-API review and Stripe both require these to be publicly reachable.
const OPEN_PATHS = ['/privacy', '/terms', '/contact'];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthed = !!req.auth;

  // API routes must never be redirected. They guard themselves (returning
  // 401 JSON when needed) and are called via fetch(), which silently follows
  // a 307 and returns HTML — that broke the login mfa-check, surfacing as a
  // bogus "Invalid email or password." Let every /api request through.
  if (pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // The landing page (root) is public; it redirects authed users to the
  // dashboard itself, in the page component.
  if (pathname === '/') {
    return NextResponse.next();
  }

  // Always-public pages — never redirect, regardless of auth state.
  if (OPEN_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p));

  if (isAuthPage && isAuthed) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
  }

  if (!isAuthPage && !isAuthed) {
    const url = new URL('/login', req.nextUrl);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  // Exclude static assets, images, and the Stripe webhook (must receive raw body)
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/billing/webhook).*)'],
};
