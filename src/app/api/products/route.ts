import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCached } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp           = req.nextUrl.searchParams;
  const orgId        = session.user.orgId;
  const page         = Number(sp.get('page') ?? 1);
  const pageSize     = Math.min(Number(sp.get('pageSize') ?? 25), 100);
  const search       = sp.get('search') || undefined;
  const category     = sp.get('category') || undefined;
  const retailer     = sp.get('retailer') || undefined;
  const buyBoxOwner  = sp.get('buyBoxOwner') || undefined;
  const ipRisk       = sp.get('ipRisk') || undefined;
  const minRoi       = sp.get('minRoi')    ? Number(sp.get('minRoi'))    : undefined;
  const minProfit    = sp.get('minProfit') ? Number(sp.get('minProfit')) : undefined;
  const sortBy       = sp.get('sortBy') ?? 'score';
  const sortOrder    = (sp.get('sortOrder') as 'asc' | 'desc') ?? 'desc';

  const where: any = {
    orgId,
    ...(search    ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { asin: { contains: search } }] } : {}),
    ...(category  ? { category:      { equals: category, mode: 'insensitive' } } : {}),
    ...(retailer  ? { sourceRetailer:{ equals: retailer, mode: 'insensitive' } } : {}),
    ...(buyBoxOwner ? { buyBoxOwner } : {}),
    ...(ipRisk    ? { ipRiskScore: ipRisk.toUpperCase() } : {}),
    ...(minRoi    != null ? { roi:    { gte: minRoi    } } : {}),
    ...(minProfit != null ? { profit: { gte: minProfit } } : {}),
  };

  const VALID_SORT = ['score', 'roi', 'profit', 'bsr', 'createdAt'];
  const orderBy = { [VALID_SORT.includes(sortBy) ? sortBy : 'score']: sortOrder };

  const cacheKey = `products:${orgId}:${JSON.stringify({ page, pageSize, search, category, retailer, buyBoxOwner, ipRisk, minRoi, minProfit, sortBy, sortOrder })}`;

  const result = await getCached(cacheKey, async () => {
    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      prisma.product.findMany({ where, orderBy, skip, take: pageSize }),
      prisma.product.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }, 60);

  return NextResponse.json({ success: true, ...result });
}
