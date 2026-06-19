import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/api/auth'];

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

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (isPublic && isAuthed) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
  }

  if (!isPublic && !isAuthed) {
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
