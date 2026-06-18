import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { validatePassword } from '@/lib/password';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const inviteSchema = z.object({
  email:    z.string().email(),
  name:     z.string().max(80).optional(),
  role:     z.enum(['ADMIN', 'ANALYST', 'VIEWER']).default('ANALYST'),
  password: z.string().max(100),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Only owners and admins can invite users.' }, { status: 403 });
  }

  const body   = await req.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { email, name, role, password } = parsed.data;

  const pwError = validatePassword(password);
  if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'A user with that email already exists.' }, { status: 409 });
  }

  const hashed = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { email, name: name || null, role, password: hashed, orgId: session.user.orgId },
    select: { id: true, email: true, name: true, role: true },
  });

  await prisma.auditLog.create({
    data: {
      orgId:    session.user.orgId,
      userId:   session.user.id,
      action:   'INVITE_USER',
      resource: 'User',
      metadata: { email, role },
    },
  });

  return NextResponse.json({ success: true, user }, { status: 201 });
}
