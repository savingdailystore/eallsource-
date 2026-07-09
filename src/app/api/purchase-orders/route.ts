import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const itemSchema = z.object({
  leadId:      z.string().cuid().optional(),
  productId:   z.string().cuid().optional(),
  asin:        z.string().length(10).optional(),
  sku:         z.string().optional(),
  productName: z.string().min(1),
  sourceUrl:   z.string().url().optional(),
  quantityOrdered: z.number().int().positive(),
  unitCost:        z.number().positive(),
  notes:           z.string().max(1000).optional(),
});

const createSchema = z.object({
  supplierName:    z.string().min(1),
  supplierOrderId: z.string().optional(),
  orderDate:       z.string().datetime(),
  expectedDate:    z.string().datetime().optional(),
  notes:           z.string().max(2000).optional(),
  shippingCost:    z.number().nonnegative().default(0),
  tax:             z.number().nonnegative().default(0),
  items:           z.array(itemSchema).min(1),
  leadIds:         z.array(z.string().cuid()).optional(), // leads to mark PURCHASED
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { orgId } = session.user;
  const sp       = req.nextUrl.searchParams;
  const page     = Math.max(1, parseInt(sp.get('page') ?? '1'));
  const pageSize = Math.min(100, parseInt(sp.get('pageSize') ?? '25'));
  const status   = sp.get('status') ?? undefined;

  const where = {
    orgId,
    ...(status ? { status: status as never } : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { orderDate: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      include: {
        items: {
          select: {
            id: true,
            productName: true,
            asin: true,
            quantityOrdered: true,
            quantityReceived: true,
            unitCost: true,
            totalCost: true,
            status: true,
          },
        },
      },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  return NextResponse.json({
    data: orders,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { role, orgId, id: userId } = session.user;
  if (role === 'VIEWER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    supplierName, supplierOrderId, orderDate, expectedDate,
    notes, shippingCost, tax, items, leadIds,
  } = parsed.data;

  // Compute item totalCosts and PO totalCost
  const itemsWithTotals = items.map((item) => ({
    ...item,
    totalCost: item.quantityOrdered * item.unitCost,
    orgId,
    status: 'ORDERED' as const,
  }));

  const itemsSubtotal = itemsWithTotals.reduce((s, i) => s + i.totalCost, 0);
  const totalCost     = itemsSubtotal + shippingCost + tax;

  const po = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseOrder.create({
      data: {
        orgId,
        supplierName,
        supplierOrderId,
        orderDate:       new Date(orderDate),
        expectedDate:    expectedDate ? new Date(expectedDate) : undefined,
        notes,
        shippingCost,
        tax,
        totalCost,
        status:          'ORDERED',
        createdByUserId: userId,
        items: {
          create: itemsWithTotals.map(({ leadId, productId, asin, sku, productName, sourceUrl, quantityOrdered, unitCost, totalCost: tc, notes: n, orgId: _orgId, status: _s }) => ({
            orgId,
            leadId:          leadId   ?? undefined,
            productId:       productId ?? undefined,
            asin:            asin      ?? undefined,
            sku:             sku       ?? undefined,
            productName,
            sourceUrl:       sourceUrl ?? undefined,
            quantityOrdered,
            unitCost,
            totalCost: tc,
            status:    'ORDERED' as const,
            notes:     n         ?? undefined,
          })),
        },
      },
      include: { items: true },
    });

    // Mark leads as PURCHASED
    if (leadIds && leadIds.length > 0) {
      await tx.lead.updateMany({
        where: { id: { in: leadIds }, orgId },
        data:  { status: 'PURCHASED' },
      });
    }

    return created;
  });

  return NextResponse.json(po, { status: 201 });
}
