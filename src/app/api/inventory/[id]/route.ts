import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  title:           z.string().min(1).optional(),
  asin:            z.string().min(1).optional(),
  retailer:        z.string().optional().nullable(),
  costBasis:       z.number().nonnegative().optional(),
  quantity:        z.number().int().positive().optional(),
  purchaseDate:    z.string().optional(),
  listedPrice:     z.number().nonnegative().optional().nullable(),
  status:          z.enum(['IN_STOCK', 'LISTED', 'SOLD']).optional(),
  estimatedProfit: z.number().optional().nullable(),
  actualProfit:    z.number().optional().nullable(),
  soldAt:          z.string().datetime().optional().nullable(),
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

  const { purchaseDate, soldAt, costBasis, listedPrice, ...rest } = parsed.data;

  const estimatedProfit =
    rest.estimatedProfit !== undefined
      ? rest.estimatedProfit
      : costBasis !== undefined || listedPrice !== undefined
        ? (() => {
            const cost   = costBasis   ?? existing.costBasis;
            const listed = listedPrice ?? existing.listedPrice;
            const qty    = rest.quantity ?? existing.quantity;
            return listed != null ? (listed - cost) * qty : null;
          })()
        : undefined;

  const item = await prisma.inventoryItem.update({
    where: { id },
    data: {
      ...rest,
      ...(costBasis    !== undefined ? { costBasis }                      : {}),
      ...(listedPrice  !== undefined ? { listedPrice }                    : {}),
      ...(purchaseDate               ? { purchaseDate: new Date(purchaseDate) } : {}),
      ...(soldAt !== undefined       ? { soldAt: soldAt ? new Date(soldAt) : null } : {}),
      ...(estimatedProfit !== undefined ? { estimatedProfit } : {}),
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
