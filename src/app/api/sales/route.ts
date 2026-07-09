import { NextResponse } from 'next/server';
import { auth }         from '@/lib/auth';
import { prisma }       from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { role, orgId, plan } = session.user;

  if (plan === 'STARTER') {
    return NextResponse.json({ error: 'Sales & Profit Tracking requires a Pro plan' }, { status: 403 });
  }
  if (role === 'VIEWER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url    = new URL(req.url);
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const asin   = url.searchParams.get('asin')   ?? undefined;
  const sku    = url.searchParams.get('sku')     ?? undefined;
  const days   = parseInt(url.searchParams.get('days') ?? '0', 10);

  const where: Record<string, unknown> = { orgId };
  if (asin)    where['asin'] = asin;
  if (sku)     where['sku']  = sku;
  if (days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    where['saleDate'] = { gte: since };
  }

  const [items, total] = await Promise.all([
    prisma.saleRecord.findMany({
      where,
      orderBy: { saleDate: 'desc' },
      take:    PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id:                    true,
        dedupKey:              true,
        orderItemId:           true,
        amazonOrderId:         true,
        asin:                  true,
        sku:                   true,
        productName:           true,
        saleDate:              true,
        quantitySold:          true,
        grossRevenue:          true,
        itemTax:               true,
        promotionDiscount:     true,
        netRevenue:            true,
        fulfillmentChannel:    true,
        orderStatus:           true,
        referralFee:           true,
        fbaFee:                true,
        otherFees:             true,
        totalFees:             true,
        unitCostUsed:          true,
        costSource:            true,
        cogs:                  true,
        grossProfitBeforeFees: true,
        grossRoiBeforeFees:    true,
        realizedProfit:        true,
        roi:                   true,
        importSource:          true,
        createdAt:             true,
      },
    }),
    prisma.saleRecord.count({ where }),
  ]);

  const hasMore    = items.length > PAGE_SIZE;
  const pageItems  = hasMore ? items.slice(0, PAGE_SIZE) : items;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1].id : null;

  const lastSync = await prisma.salesSync.findFirst({
    where:   { orgId },
    orderBy: { startedAt: 'desc' },
    select:  { status: true, completedAt: true, recordsUpserted: true, source: true, error: true, startedAt: true },
  });

  return NextResponse.json({ items: pageItems, total, nextCursor, lastSync });
}
