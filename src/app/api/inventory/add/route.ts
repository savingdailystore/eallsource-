import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = session.user.orgId;
  const body  = await req.json();

  const { sku, fnsku, asin, productName, availableQuantity, reservedQuantity, inboundQuantity, totalQuantity } = body;

  if (!asin || !productName) {
    return NextResponse.json({ error: 'ASIN and Product Name are required.' }, { status: 400 });
  }

  const toInt = (v: any) => parseInt(v ?? '0', 10) || 0;

  const item = await prisma.inventoryItem.upsert({
    where:  { orgId_asin: { orgId, asin: String(asin).trim().toUpperCase() } },
    create: {
      orgId,
      sku:               sku?.trim() || null,
      fnsku:             fnsku?.trim() || null,
      asin:              String(asin).trim().toUpperCase(),
      productName:       String(productName).trim(),
      availableQuantity: toInt(availableQuantity),
      reservedQuantity:  toInt(reservedQuantity),
      inboundQuantity:   toInt(inboundQuantity),
      totalQuantity:     toInt(totalQuantity),
    },
    update: {
      sku:               sku?.trim() || null,
      fnsku:             fnsku?.trim() || null,
      productName:       String(productName).trim(),
      availableQuantity: toInt(availableQuantity),
      reservedQuantity:  toInt(reservedQuantity),
      inboundQuantity:   toInt(inboundQuantity),
      totalQuantity:     toInt(totalQuantity),
    },
  });

  return NextResponse.json(item, { status: 201 });
}
