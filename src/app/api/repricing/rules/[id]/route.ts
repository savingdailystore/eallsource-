import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateReprice } from '@/engines/repricing';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  minRoi:    z.number().min(0).max(500).optional(),
  minProfit: z.number().min(0).optional(),
  strategy:  z.enum(['COMPETITIVE', 'FLOOR', 'CEILING']).optional(),
  isActive:  z.boolean().optional(),
  title:     z.string().max(500).optional(),
});

async function getRule(id: string, orgId: string) {
  return prisma.repricingRule.findFirst({ where: { id, orgId } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const rule = await getRule(id, session.user.orgId);
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const history = await prisma.repricingHistory.findMany({
    where: { ruleId: id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  return NextResponse.json({ success: true, data: { ...rule, history } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const rule = await getRule(id, session.user.orgId);
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body   = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const updated = await prisma.repricingRule.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const rule = await getRule(id, session.user.orgId);
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.repricingRule.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}

// POST /api/repricing/rules/[id]/run — manually trigger a reprice calculation
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.user.plan === 'STARTER') {
    return NextResponse.json({ error: 'Repricing requires PRO or ENTERPRISE plan' }, { status: 403 });
  }

  const { id } = await params;
  const rule = await getRule(id, session.user.orgId);
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Prefer scanned Amazon market data; fall back to manually-entered inventory.
  const [product, inv] = await Promise.all([
    prisma.product.findFirst({ where: { orgId: session.user.orgId, asin: rule.asin } }),
    prisma.inventoryItem.findFirst({ where: { orgId: session.user.orgId, asin: rule.asin } }),
  ]);

  const costBasis    = product?.totalLandedCost ?? product?.sourcePrice ?? inv?.costBasis ?? 0;
  const currentPrice = rule.lastRecommendedPrice ?? product?.estimatedResellPrice ?? inv?.listedPrice ?? 0;
  const buyBoxPrice  = product?.buyBoxPrice ?? 0;
  const fbaSellers   = product?.fbaSellers ?? 0;

  if (costBasis <= 0 || currentPrice <= 0) {
    return NextResponse.json(
      { error: 'No price data for this ASIN — add a cost basis and listed price to the inventory item.' },
      { status: 400 },
    );
  }

  const result = calculateReprice({
    asin:         rule.asin,
    costBasis,
    currentPrice,
    buyBoxPrice,
    fbaSellers,
    minRoi:       rule.minRoi,
    minProfit:    rule.minProfit,
    strategy:     rule.strategy as 'COMPETITIVE' | 'FLOOR' | 'CEILING',
  });

  await prisma.$transaction([
    prisma.repricingRule.update({
      where: { id },
      data: {
        lastRecommendedPrice: result.recommendedPrice,
        lastDirection:        result.direction,
        lastRepricedAt:       new Date(),
      },
    }),
    prisma.repricingHistory.create({
      data: {
        ruleId:           id,
        buyBoxPrice:      buyBoxPrice || null,
        recommendedPrice: result.recommendedPrice,
        direction:        result.direction,
        riskScore:        result.riskScore,
      },
    }),
  ]);

  return NextResponse.json({ success: true, data: result });
}
