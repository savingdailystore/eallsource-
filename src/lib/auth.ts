import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { decrypt } from './encryption';
import { verifyTotp } from './mfa';

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
  },
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

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: { org: true },
        });

        if (!user) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password,
        );
        if (!valid) return null;

        // Enforce MFA when enabled.
        if (user.mfaEnabled && user.mfaSecret) {
          const code = (credentials.totp as string) ?? '';
          if (!code) return null;
          const ok = verifyTotp(code, decrypt(user.mfaSecret));
          if (!ok) return null;
        }

        return {
          id:      user.id,
          email:   user.email,
          name:    user.name ?? undefined,
          role:    user.role,
          orgId:   user.orgId,
          orgSlug: user.org.slug,
          plan:    user.org.plan,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id      = user.id;
        token.role    = (user as any).role;
        token.orgId   = (user as any).orgId;
        token.orgSlug = (user as any).orgSlug;
        token.plan    = (user as any).plan;
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
      session.user.id      = token.id as string;
      session.user.role    = token.role as any;
      session.user.orgId   = token.orgId as string;
      session.user.orgSlug = token.orgSlug as string;
      session.user.plan    = token.plan as any;
      return session;
    },
  },
});
