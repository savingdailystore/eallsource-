import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { decrypt } from './encryption';
import { verifyTotp } from './mfa';
import { isRateLimited, recordAttempt, resetAttempts } from './rate-limit';
import { authConfig } from './auth.config';

// This file is Node-only (Prisma, bcrypt, the Redis-backed rate limiter) and
// must never be imported from src/middleware.ts — that runs in the Edge
// runtime, which can't bundle ioredis. Middleware builds its own NextAuth
// instance from auth.config.ts (no providers, no Node-only imports) instead.
// See the comment there for the full explanation.

// Mirrors the limits in api/auth/mfa-check — this authorize() callback is the
// actual credential check NextAuth runs, so it needs its own brute-force
// guard rather than relying solely on the pre-check endpoint the login form
// happens to call first. This is also the only place the real TOTP code is
// verified during login (mfa-check only verifies the password), so the TOTP
// limiter here is the actual protection for that step, not just defense in
// depth.
const LOGIN_MAX_ATTEMPTS   = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const TOTP_MAX_ATTEMPTS    = 5;
const TOTP_WINDOW_SECONDS  = 10 * 60;

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Email & Password',
      credentials: {
        email:    { label: 'Email',    type: 'email' },
        password: { label: 'Password', type: 'password' },
        totp:     { label: '2FA Code', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email    = (credentials.email as string).toLowerCase();
        const loginKey = `login:email:${email}`;

        if ((await isRateLimited(loginKey, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS)).limited) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: { org: true },
        });

        if (!user) {
          await recordAttempt(loginKey, LOGIN_WINDOW_SECONDS);
          return null;
        }

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password,
        );
        if (!valid) {
          await recordAttempt(loginKey, LOGIN_WINDOW_SECONDS);
          return null;
        }
        await resetAttempts(loginKey);

        // Enforce MFA when enabled, with its own brute-force guard — a TOTP
        // code is only 6 digits, so unlimited guesses would be feasible.
        if (user.mfaEnabled && user.mfaSecret) {
          const totpKey = `mfa-totp:${user.id}`;
          if ((await isRateLimited(totpKey, TOTP_MAX_ATTEMPTS, TOTP_WINDOW_SECONDS)).limited) {
            return null;
          }

          const code = (credentials.totp as string) ?? '';
          if (!code) return null;
          const ok = verifyTotp(code, decrypt(user.mfaSecret));
          if (!ok) {
            await recordAttempt(totpKey, TOTP_WINDOW_SECONDS);
            return null;
          }
          await resetAttempts(totpKey);
        }

        return {
          id:            user.id,
          email:         user.email,
          name:          user.name ?? undefined,
          role:          user.role,
          orgId:         user.orgId,
          orgSlug:       user.org.slug,
          plan:          user.org.plan,
          canManualLead: user.canManualLead,
        };
      },
    }),
  ],
  events: {
    async signIn({ user }) {
      if (!user.id || !(user as any).orgId) return;
      void prisma.auditLog.create({
        data: {
          orgId:    (user as any).orgId,
          userId:   user.id,
          action:   'USER_LOGIN',
          resource: 'User',
          metadata: { email: user.email },
        },
      }).catch(() => {});
    },
  },
});
