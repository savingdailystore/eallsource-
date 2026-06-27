import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { isRateLimited, recordAttempt, resetAttempts } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';

export const dynamic = 'force-dynamic';

// Brute-force protection: this endpoint performs the real password check, so
// it's the actual guessing oracle for the login flow. Lock out both by
// account (so one attacker can't grind a single victim's password) and by IP
// (so one attacker can't grind many accounts from one source). Limits are
// deliberately generous enough not to lock out a user who fumbles their own
// password a few times.
const MAX_ATTEMPTS    = 10;
const WINDOW_SECONDS  = 15 * 60;

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));

  if (!email || !password) {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  const ip       = getClientIp(req);
  const emailKey = `login:email:${String(email).toLowerCase()}`;
  const ipKey    = `login:ip:${ip}`;

  const [emailLimited, ipLimited] = await Promise.all([
    isRateLimited(emailKey, MAX_ATTEMPTS, WINDOW_SECONDS),
    isRateLimited(ipKey, MAX_ATTEMPTS, WINDOW_SECONDS),
  ]);

  if (emailLimited.limited || ipLimited.limited) {
    const retryAfterSeconds = Math.max(emailLimited.retryAfterSeconds, ipLimited.retryAfterSeconds);
    return NextResponse.json(
      { valid: false, error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await Promise.all([recordAttempt(emailKey, WINDOW_SECONDS), recordAttempt(ipKey, WINDOW_SECONDS)]);
    return NextResponse.json({ valid: false });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    await Promise.all([recordAttempt(emailKey, WINDOW_SECONDS), recordAttempt(ipKey, WINDOW_SECONDS)]);
    return NextResponse.json({ valid: false });
  }

  // Successful password check — clear both counters so a legitimate user who
  // mistyped a few times isn't penalized on their next login.
  await Promise.all([resetAttempts(emailKey), resetAttempts(ipKey)]);

  return NextResponse.json({ valid: true, mfaRequired: user.mfaEnabled });
}
