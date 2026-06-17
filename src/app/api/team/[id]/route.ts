import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  role: z.enum(['ADMIN', 'ANALYST', 'VIEWER']),
});

async function getTarget(id: string, orgId: string) {
  return prisma.user.findFirst({ where: { id, orgId } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const target = await getTarget(id, session.user.orgId);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.role === 'OWNER') {
    return NextResponse.json({ error: "The owner's role can't be changed." }, { status: 400 });
  }

  const body   = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const user = await prisma.user.update({
    where: { id },
    data:  { role: parsed.data.role },
    select: { id: true, email: true, name: true, role: true },
  });

  await prisma.auditLog.create({
    data: {
      orgId:    session.user.orgId,
      userId:   session.user.id,
      action:   'UPDATE_USER_ROLE',
      resource: 'User',
      metadata: { targetId: id, role: parsed.data.role },
    },
  });

  return NextResponse.json({ success: true, user });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  if (id === session.user.id) {
    return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });
  }

  const target = await getTarget(id, session.user.orgId);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.role === 'OWNER') {
    return NextResponse.json({ error: "The owner can't be removed." }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      orgId:    session.user.orgId,
      userId:   session.user.id,
      action:   'REMOVE_USER',
      resource: 'User',
      metadata: { targetId: id, email: target.email },
    },
  });

  return new NextResponse(null, { status: 204 });
}
