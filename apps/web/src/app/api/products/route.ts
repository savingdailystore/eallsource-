import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@lib/prisma';
import { getCached } from '@lib/redis';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const search         = searchParams.get('search') || undefined;
    const minRoi         = searchParams.get('minRoi') ? Number(searchParams.get('minRoi')) : undefined;
    const maxRoi         = searchParams.get('maxRoi') ? Number(searchParams.get('maxRoi')) : undefined;
    const minProfit      = searchParams.get('minProfit') ? Number(searchParams.get('minProfit')) : undefined;
    const maxProfit      = searchParams.get('maxProfit') ? Number(searchParams.get('maxProfit')) : undefined;
    const category       = searchParams.get('category') || undefined;
    const sourceRetailer = searchParams.get('sourceRetailer') || undefined;
    const buyBoxOwner    = searchParams.get('buyBoxOwner') || undefined;
    const ipRisk         = searchParams.get('ipRisk') || undefined;
    const page           = Number(searchParams.get('page') ?? 1);
    const pageSize       = Math.min(Number(searchParams.get('pageSize') ?? 20), 100);
    const sortBy         = searchParams.get('sortBy') ?? 'createdAt';
    const sortOrder      = (searchParams.get('sortOrder') as 'asc' | 'desc') ?? 'desc';

    const cacheKey = `products:${JSON.stringify({ search, minRoi, maxRoi, minProfit, maxProfit, category, sourceRetailer, buyBoxOwner, ipRisk, page, pageSize, sortBy, sortOrder })}`;

    const result = await getCached(
      cacheKey,
      async () => {
        const where: Record<string, unknown> = {};

        if (search) {
          where.OR = [
            { title: { contains: search, mode: 'insensitive' } },
            { asin: { contains: search, mode: 'insensitive' } },
          ];
        }

        if (minRoi !== undefined || maxRoi !== undefined) {
          where.roi = {};
          if (minRoi !== undefined) (where.roi as Record<string, number>).gte = minRoi;
          if (maxRoi !== undefined) (where.roi as Record<string, number>).lte = maxRoi;
        }

        if (minProfit !== undefined || maxProfit !== undefined) {
          where.profit = {};
          if (minProfit !== undefined) (where.profit as Record<string, number>).gte = minProfit;
          if (maxProfit !== undefined) (where.profit as Record<string, number>).lte = maxProfit;
        }

        if (category)       where.category       = { equals: category,       mode: 'insensitive' };
        if (sourceRetailer) where.sourceRetailer = { equals: sourceRetailer, mode: 'insensitive' };
        if (buyBoxOwner)    where.buyBoxOwner    = buyBoxOwner;
        if (ipRisk)         where.ipRiskScore    = ipRisk.toUpperCase();

        const validSortFields = ['createdAt', 'roi', 'profit', 'score', 'price'];
        const orderBy: Record<string, string> = {};
        orderBy[validSortFields.includes(sortBy) ? sortBy : 'createdAt'] = sortOrder;

        const skip = (page - 1) * pageSize;
        const [data, total] = await Promise.all([
          prisma.product.findMany({ where, skip, take: pageSize, orderBy }),
          prisma.product.count({ where }),
        ]);

        return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
      },
      60,
    );

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
