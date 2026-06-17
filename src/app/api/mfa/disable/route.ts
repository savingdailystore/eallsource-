import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

// Requires the account password to turn MFA off (prevents a hijacked session
// from silently disabling 2FA).
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { password } = await req.json().catch(() => ({}));
  if (!password) return NextResponse.json({ error: 'Enter your password.' }, { status: 400 });

  const user  = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return NextResponse.json({ error: 'Incorrect password.' }, { status: 400 });

  await prisma.user.update({
    where: { id: user.id },
    data:  { mfaEnabled: false, mfaSecret: null },
  });

  await prisma.auditLog.create({
    data: { orgId: session.user.orgId, userId: user.id, action: 'MFA_DISABLE', resource: 'User' },
  });

  return NextResponse.json({ success: true });
}
