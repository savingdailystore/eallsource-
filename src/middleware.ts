import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register', '/api/auth'];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isAuthed = !!req.auth;

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
