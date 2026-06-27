import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendPasswordResetEmail } from '@/lib/email';
import { isRateLimited, recordAttempt } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';

export const dynamic = 'force-dynamic';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Limit by IP only — limiting by email too would let an attacker confirm an
// email exists by triggering its limit independently of others, defeating
// the enumeration protection the generic response below provides.
const MAX_REQUESTS_PER_IP = 5;
const WINDOW_SECONDS       = 60 * 60;

// Request a password reset. Always returns the same generic success response so
// the endpoint can't be used to discover which emails have accounts.
export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));

  const generic = NextResponse.json({
    ok: true,
    message: 'If an account exists for that email, a reset link is on its way.',
  });

  const ip      = getClientIp(req);
  const ipKey   = `forgot-password:ip:${ip}`;
  const limited = await isRateLimited(ipKey, MAX_REQUESTS_PER_IP, WINDOW_SECONDS);
  if (limited.limited) {
    // Same generic shape — only status/header differ — so the rate limit
    // itself can't become a new enumeration signal.
    return NextResponse.json(
      { ok: true, message: 'If an account exists for that email, a reset link is on its way.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    );
  }
  await recordAttempt(ipKey, WINDOW_SECONDS);

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
