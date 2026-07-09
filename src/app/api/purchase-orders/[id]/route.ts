import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  supplierName:    z.string().min(1).optional(),
  supplierOrderId: z.string().optional(),
  orderDate:       z.string().datetime().optional(),
  expectedDate:    z.string().datetime().nullable().optional(),
  notes:           z.string().max(2000).optional(),
  shippingCost:    z.number().nonnegative().optional(),
  tax:             z.number().nonnegative().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, orgId: session.user.orgId },
    include: {
      items: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(po);
}

export async function PATCH(
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

  if (po.status === 'CANCELLED') {
    return NextResponse.json({ error: 'Cannot edit a cancelled order' }, { status: 422 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { shippingCost, tax, ...rest } = parsed.data;

  let totalCostUpdate: { totalCost: number } | undefined;
  if (shippingCost !== undefined || tax !== undefined) {
    const newShipping = shippingCost ?? po.shippingCost;
    const newTax      = tax          ?? po.tax;
    const items       = await prisma.purchaseOrderItem.findMany({
      where:  { purchaseOrderId: po.id, status: { not: 'CANCELLED' } },
      select: { totalCost: true },
    });
    const itemsSubtotal = items.reduce((s, i) => s + i.totalCost, 0);
    totalCostUpdate     = { totalCost: itemsSubtotal + newShipping + newTax };
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: {
      ...rest,
      ...(parsed.data.orderDate ? { orderDate: new Date(parsed.data.orderDate) } : {}),
      ...(parsed.data.expectedDate !== undefined
        ? { expectedDate: parsed.data.expectedDate ? new Date(parsed.data.expectedDate) : null }
        : {}),
      ...(shippingCost !== undefined ? { shippingCost } : {}),
      ...(tax          !== undefined ? { tax }          : {}),
      ...totalCostUpdate,
    },
    include: { items: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { role, orgId } = session.user;

  if (role !== 'OWNER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const po = await prisma.purchaseOrder.findFirst({
    where:   { id, orgId },
    include: { items: true },
  });
  if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (po.status === 'RECEIVED') {
    return NextResponse.json(
      { error: 'Cannot cancel a fully received order' },
      { status: 422 },
    );
  }
  if (po.status === 'CLOSED') {
    return NextResponse.json(
      { error: 'Cannot cancel a closed order' },
      { status: 422 },
    );
  }

  await prisma.$transaction([
    prisma.purchaseOrderItem.updateMany({
      where: { purchaseOrderId: po.id, status: { notIn: ['RECEIVED'] } },
      data:  { status: 'CANCELLED' },
    }),
    prisma.purchaseOrder.update({
      where: { id: po.id },
      data:  { status: 'CANCELLED' },
    }),
  ]);

  return NextResponse.json({ success: true });
}
