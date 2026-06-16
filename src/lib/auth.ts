import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

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
