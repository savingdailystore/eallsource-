import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendPasswordResetEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Request a password reset. Always returns the same generic success response so
// the endpoint can't be used to discover which emails have accounts.
export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));

  const generic = NextResponse.json({
    ok: true,
    message: 'If an account exists for that email, a reset link is on its way.',
  });

  if (!email || typeof email !== 'string') return generic;

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) return generic;

  // Raw token goes in the email link; only its hash is stored.
  const rawToken  = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  // Invalidate any outstanding tokens for this user, then issue a fresh one.
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.passwordResetToken.create({
    data: { tokenHash, userId: user.id, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
  });

  const baseUrl  = process.env.NEXTAUTH_URL ?? 'https://eallsource.com';
  const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

  try {
    await sendPasswordResetEmail(user.email, resetUrl);
  } catch (err) {
    console.error('[forgot-password] failed to send email:', err);
    // Still return generic success — don't leak send failures to the client.
  }

  return generic;
}
