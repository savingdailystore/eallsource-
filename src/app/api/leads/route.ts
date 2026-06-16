import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCached } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp         = req.nextUrl.searchParams;
  const orgId      = session.user.orgId;
  const page       = Number(sp.get('page') ?? 1);
  const pageSize   = Math.min(Number(sp.get('pageSize') ?? 25), 100);
  const status     = sp.get('status') ?? undefined;
  const minRoi     = sp.get('minRoi')    ? Number(sp.get('minRoi'))    : undefined;
  const minProfit  = sp.get('minProfit') ? Number(sp.get('minProfit')) : undefined;
  const sortBy     = sp.get('sortBy') ?? 'score';

  const where: any = {
    orgId,
    ...(status
      ? { status }
      : { status: { notIn: ['REJECTED', 'EXPIRED'] } }),
    product: {
      validationPassed: true,
      ...(minRoi    != null ? { roi:    { gte: minRoi    } } : {}),
      ...(minProfit != null ? { profit: { gte: minProfit } } : {}),
    },
  };

  const orderBy =
    sortBy === 'roi'    ? { product: { roi:    'desc' as const } } :
    sortBy === 'profit' ? { product: { profit: 'desc' as const } } :
    { score: 'desc' as const };

  const cacheKey = `leads:${orgId}:${JSON.stringify({ page, pageSize, status, minRoi, minProfit, sortBy })}`;

  const result = await getCached(cacheKey, async () => {
    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: { product: true },
      }),
      prisma.lead.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }, 60);

  return NextResponse.json({ success: true, ...result });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, status } = await req.json();
  const VALID_STATUSES = ['NEW', 'SAVED', 'PURCHASED', 'REJECTED', 'EXPIRED'];

  if (!id || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const lead = await prisma.lead.findFirst({
    where: { id, orgId: session.user.orgId },
  });

  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.lead.update({
    where: { id },
    data: {
      status,
      ...(status === 'SAVED' ? { savedAt: new Date() } : {}),
    },
  });

  return NextResponse.json({ success: true, data: updated });
}
