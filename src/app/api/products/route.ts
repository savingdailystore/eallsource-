import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCached } from '@/lib/redis';
import type { ProductFilters } from '@/types';

export async function GET(req: NextRequest) {
  try {
  const { searchParams } = req.nextUrl;

  const filters: ProductFilters = {
    search: searchParams.get('search') || undefined,
    category: searchParams.get('category') || undefined,
    sourceRetailer: searchParams.get('sourceRetailer') || undefined,
    buyBoxOwner: (searchParams.get('buyBoxOwner') as ProductFilters['buyBoxOwner']) || undefined,
    minRoi: searchParams.get('minRoi') ? Number(searchParams.get('minRoi')) : undefined,
    maxRoi: searchParams.get('maxRoi') ? Number(searchParams.get('maxRoi')) : undefined,
    minProfit: searchParams.get('minProfit') ? Number(searchParams.get('minProfit')) : undefined,
    maxProfit: searchParams.get('maxProfit') ? Number(searchParams.get('maxProfit')) : undefined,
    minPrice: searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined,
    maxPrice: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
    ipRisk: (searchParams.get('ipRisk') as ProductFilters['ipRisk']) || undefined,
    page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
    pageSize: searchParams.get('pageSize') ? Number(searchParams.get('pageSize')) : 20,
    sortBy: searchParams.get('sortBy') || 'dateAdded',
    sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
  };

  const cacheKey = `products:${JSON.stringify(filters)}`;

  const result = await getCached(
    cacheKey,
    async () => {
      const where: Record<string, unknown> = {
        status: 'ACTIVE',
        ipRiskScore: 'LOW',
        hasBrandGating: false,
        hasCounterfeitRisk: false,
        isHazmat: false,
        isRestrictedCategory: false,
      };

      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { asin: { contains: filters.search, mode: 'insensitive' } },
          { sourceRetailer: { contains: filters.search, mode: 'insensitive' } },
        ];
      }
      if (filters.category) where.category = filters.category;
      if (filters.sourceRetailer) where.sourceRetailer = filters.sourceRetailer;
      if (filters.buyBoxOwner) where.buyBoxOwner = filters.buyBoxOwner;
      if (filters.ipRisk) where.ipRiskScore = filters.ipRisk;

      if (filters.minRoi !== undefined || filters.maxRoi !== undefined) {
        where.roi = {};
        if (filters.minRoi !== undefined) (where.roi as Record<string, number>).gte = filters.minRoi;
        if (filters.maxRoi !== undefined) (where.roi as Record<string, number>).lte = filters.maxRoi;
      }

      if (filters.minProfit !== undefined || filters.maxProfit !== undefined) {
        where.netProfit = {};
        if (filters.minProfit !== undefined) (where.netProfit as Record<string, number>).gte = filters.minProfit;
        if (filters.maxProfit !== undefined) (where.netProfit as Record<string, number>).lte = filters.maxProfit;
      }

      if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
        where.sourcePrice = {};
        if (filters.minPrice !== undefined) (where.sourcePrice as Record<string, number>).gte = filters.minPrice;
        if (filters.maxPrice !== undefined) (where.sourcePrice as Record<string, number>).lte = filters.maxPrice;
      }

      const page = filters.page ?? 1;
      const pageSize = Math.min(filters.pageSize ?? 20, 100);
      const skip = (page - 1) * pageSize;

      const orderBy: Record<string, string> = {};
      orderBy[filters.sortBy ?? 'dateAdded'] = filters.sortOrder ?? 'desc';

      const [data, total] = await Promise.all([
        prisma.product.findMany({
          where,
          skip,
          take: pageSize,
          orderBy,
        }),
        prisma.product.count({ where }),
      ]);

      return {
        data,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    },
    60, // 1-minute cache
  );

  return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
