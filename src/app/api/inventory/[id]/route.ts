import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  status: z.enum(['IN_STOCK', 'LISTED', 'SOLD']).optional(),
  listedPrice: z.number().positive().optional(),
  estimatedProfit: z.number().optional(),
  actualProfit: z.number().optional(),
  soldAt: z.string().datetime().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.inventoryItem.findFirst({
    where: { id, orgId: session.user.orgId },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const item = await prisma.inventoryItem.update({
    where: { id },
    data: {
      ...parsed.data,
      ...(parsed.data.soldAt ? { soldAt: new Date(parsed.data.soldAt) } : {}),
    },
  });

  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.inventoryItem.findFirst({
    where: { id, orgId: session.user.orgId },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.inventoryItem.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
