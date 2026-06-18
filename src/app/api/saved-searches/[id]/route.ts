import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({ enabled: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  // Scope the update to this org so one org can't touch another's rows.
  const existing = await prisma.savedSearch.findFirst({
    where: { id, orgId: session.user.orgId },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const search = await prisma.savedSearch.update({
    where: { id },
    data:  { enabled: parsed.data.enabled },
  });

  return NextResponse.json({ search });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  const existing = await prisma.savedSearch.findFirst({
    where: { id, orgId: session.user.orgId },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.savedSearch.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
