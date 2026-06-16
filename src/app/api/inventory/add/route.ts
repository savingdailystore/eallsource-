import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = session.user.orgId;
  const body  = await req.json();

  const { asin, title, retailer, costBasis, quantity, purchaseDate, listedPrice, status } = body;

  if (!asin || !title || !costBasis || !purchaseDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const costNum    = parseFloat(costBasis);
  const listedNum  = listedPrice ? parseFloat(listedPrice) : null;
  const qtyNum     = parseInt(quantity ?? '1', 10);

  const estimatedProfit = listedNum != null ? (listedNum - costNum) * qtyNum : null;

  const item = await prisma.inventoryItem.create({
    data: {
      orgId,
      asin:            asin.trim().toUpperCase(),
      title:           title.trim(),
      retailer:        retailer?.trim() || null,
      costBasis:       costNum,
      quantity:        qtyNum,
      purchaseDate:    new Date(purchaseDate),
      listedPrice:     listedNum,
      estimatedProfit,
      status:          status ?? 'IN_STOCK',
    },
  });

  return NextResponse.json(item, { status: 201 });
}
