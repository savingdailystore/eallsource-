import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!isPlatformAdmin(session?.user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
  const skip  = (page - 1) * limit;

  const sourceOrg = await prisma.organization.findFirst({
    where:  { isBroadcastSource: true },
    select: { id: true },
  });

  if (!sourceOrg) {
    return NextResponse.json({ leads: [], total: 0, page, limit });
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where:   { orgId: sourceOrg.id },
      select: {
        id:        true,
        status:    true,
        leadTier:  true,
        score:     true,
        createdAt: true,
        product: {
          select: {
            asin:            true,
            title:           true,
            sourceRetailer:  true,
            sourcePrice:     true,
            buyBoxPrice:     true,
            roi:             true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.lead.count({ where: { orgId: sourceOrg.id } }),
  ]);

  return NextResponse.json({ leads, total, page, limit });
}
