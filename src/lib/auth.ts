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
    async jwt({ token, user }) {
      if (user) {
        token.id      = user.id;
        token.role    = (user as any).role;
        token.orgId   = (user as any).orgId;
        token.orgSlug = (user as any).orgSlug;
        token.plan    = (user as any).plan;
      } else if (token.orgId) {
        // Plan can change out-of-band (Stripe webhook upgrade/downgrade), so
        // re-read it from the DB on every refresh instead of trusting the
        // value cached at sign-in — otherwise an upgrade only shows up after
        // the user signs out and back in.
        const org = await prisma.organization.findUnique({
          where:  { id: token.orgId as string },
          select: { plan: true },
        });
        if (org) token.plan = org.plan;
      }
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
