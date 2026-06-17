import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { validatePassword } from '@/lib/password';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().max(100),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const pwError = validatePassword(parsed.data.newPassword);
  if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  const valid = await bcrypt.compare(parsed.data.currentPassword, user.password);
  if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });

  const hashed = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({
    where: { id: session.user.id },
    data:  { password: hashed, passwordChangedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      orgId: session.user.orgId,
      userId: session.user.id,
      action: 'PASSWORD_CHANGE',
      resource: 'User',
    },
  });

  return NextResponse.json({ success: true });
}
