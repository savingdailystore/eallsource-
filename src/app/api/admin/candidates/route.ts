/**
 * GET /api/admin/candidates
 * Admin-only paginated list of SourceCandidates with status/retailer/sourceType filters.
 * Read-only. No writes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';
import type { CandidateStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  const email   = session?.user?.email;
  const role    = session?.user?.role;

  if (role !== 'OWNER' && !isPlatformAdmin(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp         = req.nextUrl.searchParams;
  const page       = Math.max(1, parseInt(sp.get('page')  ?? '1',  10));
  const limit      = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50', 10)));
  const skip       = (page - 1) * limit;
  const status     = sp.get('status')     as CandidateStatus | null;
  const retailer   = sp.get('retailer')   ?? undefined;
  const sourceType = sp.get('sourceType') ?? undefined;

  const sourceOrg = await prisma.organization.findFirst({
    where:  { isBroadcastSource: true },
    select: { id: true },
  });
  if (!sourceOrg) {
    return NextResponse.json({ candidates: [], total: 0, page, limit, statusCounts: {} });
  }
  const orgId = sourceOrg.id;

  const where = {
    orgId,
    ...(status     ? { certStatus: status }                               : {}),
    ...(retailer   ? { retailer:   { equals: retailer,   mode: 'insensitive' as const } } : {}),
    ...(sourceType ? { sourceType: { equals: sourceType, mode: 'insensitive' as const } } : {}),
  };

  const [candidates, total, statusGroups] = await Promise.all([
    prisma.sourceCandidate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take:  limit,
      select: {
        id:             true,
        retailer:       true,
        retailerUrl:    true,
        title:          true,
        brand:          true,
        asin:           true,
        upc:            true,
        sourcePrice:    true,
        sourceListPrice: true,
        onSale:         true,
        certStatus:     true,
        sourceType:     true,
        sourceCost:     true,
        vaNotes:        true,
        certNotes:      true,
        estimatedProfit: true,
        estimatedRoi:   true,
        buyBoxPrice:    true,
        lastCheckedAt:  true,
        amazonCheckedAt: true,
        certifiedAt:    true,
        productId:      true,
        leadId:         true,
        createdAt:      true,
        updatedAt:      true,
      },
    }),
    prisma.sourceCandidate.count({ where }),
    prisma.sourceCandidate.groupBy({
      by:    ['certStatus'],
      where: { orgId },
      _count: { id: true },
    }),
  ]);

  const statusCounts = Object.fromEntries(
    statusGroups.map(g => [g.certStatus, g._count.id])
  );

  return NextResponse.json({ candidates, total, page, limit, statusCounts });
}
