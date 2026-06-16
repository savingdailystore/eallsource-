import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: session.user.orgId },
    select: { id: true, name: true, slug: true, plan: true },
  });

  return NextResponse.json(org);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const org = await prisma.organization.update({
    where: { id: session.user.orgId },
    data: parsed.data,
    select: { id: true, name: true, slug: true, plan: true },
  });

  await prisma.auditLog.create({
    data: {
      orgId: session.user.orgId,
      userId: session.user.id,
      action: 'ORG_UPDATE',
      resource: 'Organization',
      metadata: parsed.data,
    },
  });

  return NextResponse.json(org);
}
