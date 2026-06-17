import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  sku:               z.string().optional(),
  fnsku:             z.string().optional(),
  asin:              z.string().min(10).max(10),
  productName:       z.string().min(1),
  availableQuantity: z.number().int().nonnegative().default(0),
  reservedQuantity:  z.number().int().nonnegative().default(0),
  inboundQuantity:   z.number().int().nonnegative().default(0),
  totalQuantity:     z.number().int().nonnegative().default(0),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') ?? '25'));

  const where = { orgId: session.user.orgId };

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      orderBy: { totalQuantity: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.inventoryItem.count({ where }),
  ]);

  return NextResponse.json({
    data: items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { asin, ...rest } = parsed.data;

  const item = await prisma.inventoryItem.upsert({
    where:  { orgId_asin: { orgId: session.user.orgId, asin } },
    create: { orgId: session.user.orgId, asin, ...rest },
    update: rest,
  });

  return NextResponse.json(item, { status: 201 });
}
