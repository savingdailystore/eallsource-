import { NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { validatePassword } from '@/lib/password';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  token:       z.string().min(1),
  newPassword: z.string().max(100),
});

// Complete a password reset using the token from the email link.
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const pwError = validatePassword(parsed.data.newPassword);
  if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });

  const tokenHash = crypto.createHash('sha256').update(parsed.data.token).digest('hex');

  const record = await prisma.passwordResetToken.findUnique({
    where:   { tokenHash },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
  }

  const hashed = await bcrypt.hash(parsed.data.newPassword, 12);

  // Update the password and consume the token atomically.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data:  { password: hashed, passwordChangedAt: new Date() },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data:  { usedAt: new Date() },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      orgId:    record.user.orgId,
      userId:   record.userId,
      action:   'PASSWORD_RESET',
      resource: 'User',
    },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
