import { NextResponse }  from 'next/server';
import { auth }          from '@/lib/auth';
import { prisma }        from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { role, orgId } = session.user;
  if (role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url    = new URL(req.url);
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const asin   = url.searchParams.get('asin')   ?? undefined;

  const where = {
    orgId,
    ...(asin ? { asin } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.reimbursement.findMany({
      where,
      orderBy: { approvalDate: 'desc' },
      take:    PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id:                          true,
        reimbursementId:             true,
        approvalDate:                true,
        reason:                      true,
        asin:                        true,
        sku:                         true,
        fnsku:                       true,
        productName:                 true,
        condition:                   true,
        currencyUnit:                true,
        amountPerUnit:               true,
        amountTotal:                 true,
        quantityReimbursedCash:      true,
        quantityReimbursedInventory: true,
        quantityReimbursedTotal:     true,
        originalReimbursementId:     true,
        originalReimbursementType:   true,
        importSource:                true,
        caseId:                      true,
        createdAt:                   true,
      },
    }),
    prisma.reimbursement.count({ where }),
  ]);

  const hasMore    = items.length > PAGE_SIZE;
  const pageItems  = hasMore ? items.slice(0, PAGE_SIZE) : items;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1].id : null;

  // Fetch last sync for this org
  const lastSync = await prisma.reimbursementSync.findFirst({
    where:   { orgId },
    orderBy: { startedAt: 'desc' },
    select:  { status: true, completedAt: true, recordsUpserted: true, source: true, error: true },
  });

  return NextResponse.json({
    items:      pageItems,
    total,
    nextCursor,
    lastSync,
  });
}
