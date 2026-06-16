import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  asin: z.string().min(10).max(10),
  title: z.string().min(1),
  costBasis: z.number().positive(),
  quantity: z.number().int().positive(),
  purchaseDate: z.string().datetime(),
  retailer: z.string().optional(),
  imageUrl: z.string().url().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') ?? '25'));
  const status = searchParams.get('status') ?? undefined;

  const where = {
    orgId: session.user.orgId,
    ...(status ? { status: status as 'IN_STOCK' | 'LISTED' | 'SOLD' } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      orderBy: { purchaseDate: 'desc' },
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

  const { asin, title, costBasis, quantity, purchaseDate, retailer, imageUrl } = parsed.data;

  const item = await prisma.inventoryItem.create({
    data: {
      orgId: session.user.orgId,
      asin,
      title,
      costBasis,
      quantity,
      purchaseDate: new Date(purchaseDate),
      retailer,
      imageUrl,
      status: 'IN_STOCK',
    },
  });

  return NextResponse.json(item, { status: 201 });
}
