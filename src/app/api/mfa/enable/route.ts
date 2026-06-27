import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { verifyTotp } from '@/lib/mfa';
import { isRateLimited, recordAttempt, resetAttempts } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const TOTP_MAX_ATTEMPTS   = 5;
const TOTP_WINDOW_SECONDS = 10 * 60;

// Confirms the user can generate valid codes, then turns MFA on.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await req.json().catch(() => ({}));
  if (!code) return NextResponse.json({ error: 'Enter the 6-digit code.' }, { status: 400 });

  const totpKey = `mfa-totp:${session.user.id}`;
  const limited = await isRateLimited(totpKey, TOTP_MAX_ATTEMPTS, TOTP_WINDOW_SECONDS);
  if (limited.limited) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    );
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (!user.mfaSecret) {
    return NextResponse.json({ error: 'Start MFA setup first.' }, { status: 400 });
  }

  const ok = verifyTotp(code, decrypt(user.mfaSecret));
  if (!ok) {
    await recordAttempt(totpKey, TOTP_WINDOW_SECONDS);
    return NextResponse.json({ error: 'Invalid code. Try again.' }, { status: 400 });
  }
  await resetAttempts(totpKey);

  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });

  await prisma.auditLog.create({
    data: { orgId: session.user.orgId, userId: user.id, action: 'MFA_ENABLE', resource: 'User' },
  });

  return NextResponse.json({ success: true });
}
