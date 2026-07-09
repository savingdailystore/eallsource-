import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const closeSchema = z.object({
  closeReason: z.string().max(2000).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { role, orgId } = session.user;
  if (role === 'VIEWER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, orgId },
  });
  if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (po.status === 'RECEIVED' || po.status === 'CANCELLED' || po.status === 'CLOSED') {
    return NextResponse.json(
      { error: `Cannot close a purchase order with status ${po.status}.` },
      { status: 422 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = closeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Manual close marks this purchase order closed without updating inventory.
  const updated = await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: {
      status:      'CLOSED',
      closedAt:    new Date(),
      closeReason: parsed.data.closeReason ?? null,
    },
    include: { items: true },
  });

  return NextResponse.json(updated);
}
