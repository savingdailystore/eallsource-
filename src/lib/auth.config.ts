import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe shared config — no providers, no Node-only imports (Prisma,
 * bcrypt, the Redis-backed rate limiter). src/middleware.ts builds its own
 * lightweight NextAuth instance from this file alone, so the Edge bundle
 * never pulls in ioredis or anything else that breaks under the Edge
 * runtime. The full Node config (src/lib/auth.ts) spreads this object and
 * adds the actual CredentialsProvider for the real sign-in route handler.
 */
export const authConfig: NextAuthConfig = {
  session: {
    strategy: 'jwt',
    // 8 hours — the app handles Amazon seller credentials and billing, so a
    // 30-day default session (NextAuth's fallback if unset) is longer-lived
    // than warranted. Users simply sign in again after expiry.
    maxAge: 8 * 60 * 60,
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id            = user.id;
        token.role          = (user as any).role;
        token.orgId         = (user as any).orgId;
        token.orgSlug       = (user as any).orgSlug;
        token.plan          = (user as any).plan;
        token.canManualLead = (user as any).canManualLead ?? false;
      }
      // NOTE: do NOT call Prisma here. This callback runs inside the Edge
      // middleware that guards protected routes, and PrismaClient cannot run
      // in the Edge runtime — doing so throws JWTSessionError and logs every
      // user out in a redirect loop. Out-of-band plan changes (Stripe
      // upgrades) are refreshed in server components that read the DB
      // directly, not from this token.
      return token;
    },
    session({ session, token }) {
      session.user.id            = token.id as string;
      session.user.role          = token.role as any;
      session.user.orgId         = token.orgId as string;
      session.user.orgSlug       = token.orgSlug as string;
      session.user.plan          = token.plan as any;
      (session.user as any).canManualLead = token.canManualLead as boolean;
      return session;
    },
  },
};
