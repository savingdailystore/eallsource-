import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateReprice } from '@/engines/repricing';
import { getListingMarket } from '@/lib/amazon-listings';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  minRoi:     z.number().min(0).max(500).optional(),
  minProfit:  z.number().min(0).optional(),
  strategy:   z.enum(['COMPETITIVE', 'FLOOR', 'CEILING']).optional(),
  isActive:   z.boolean().optional(),
  title:      z.string().max(500).optional(),
  floorPrice: z.number().min(0).nullable().optional(),
  costBasis:  z.number().min(0).nullable().optional(),
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

// POST /api/repricing/rules/[id] — manually run a single-rule reprice calculation.
// Mirrors the run-all logic: looks up live data, creates a PROPOSED or HOLD history
// entry, supersedes stale proposals, and returns whether a proposal was queued.
// Does NOT push to Amazon — that requires explicit user action in the Proposals panel.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.user.plan === 'STARTER') {
    return NextResponse.json({ error: 'Repricing requires PRO or ENTERPRISE plan' }, { status: 403 });
  }
  if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const orgId = session.user.orgId;
  const { id } = await params;
  const rule = await getRule(id, orgId);
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [product, inventoryItem] = await Promise.all([
    prisma.product.findFirst({ where: { orgId, asin: rule.asin } }),
    prisma.inventoryItem.findUnique({
      where:  { orgId_asin: { orgId, asin: rule.asin } },
      select: { sku: true, availableQuantity: true },
    }),
  ]);

  const sku          = inventoryItem?.sku ?? null;
  const availableQty = inventoryItem != null ? (inventoryItem.availableQuantity ?? 0) : null;

  // Guard 1: zero-inventory — emit HOLD instead of a proposal when the
  // inventory record exists but has nothing on hand.
  if (availableQty !== null && availableQty <= 0) {
    const holdPrice = rule.lastPushedPrice ?? rule.lastRecommendedPrice ?? 0;
    await prisma.$transaction([
      prisma.repricingHistory.updateMany({
        where: { ruleId: id, status: 'PROPOSED' },
        data:  { status: 'SUPERSEDED' },
      }),
      prisma.repricingRule.update({
        where: { id },
        data:  { lastRepricedAt: new Date(), lastDirection: 'HOLD' },
      }),
      prisma.repricingHistory.create({
        data: {
          ruleId:           id,
          status:           'HOLD',
          direction:        'HOLD',
          reason:           'No inventory on hand — skipping repricing proposal.',
          recommendedPrice: holdPrice,
          previousPrice:    holdPrice,
          riskScore:        0,
          sku,
          buyBoxPrice:      null,
        },
      }),
    ]);
    return NextResponse.json({
      success:        true,
      data:           { direction: 'HOLD', recommendedPrice: holdPrice, riskScore: 0, reason: 'No inventory on hand — skipping repricing proposal.' },
      status:         'HOLD',
      proposalQueued: false,
    });
  }

  // Fetch the seller's live listing price if we have a SKU (same as run-all)
  let liveCurrent: number | undefined;
  if (sku) {
    const listing = await getListingMarket(orgId, sku);
    liveCurrent = listing.currentPrice;
  }

  // Cost priority: rule.costBasis → product.totalLandedCost → product.sourcePrice
  const costBasis   = rule.costBasis ?? product?.totalLandedCost ?? product?.sourcePrice ?? 0;
  const buyBoxPrice = product?.buyBoxPrice ?? 0;
  const fbaSellers  = product?.fbaSellers  ?? 0;

  // Price priority: last pushed price → live listing → buy box → scanned resale
  const currentPrice =
    rule.lastPushedPrice
    ?? liveCurrent
    ?? (buyBoxPrice > 0 ? buyBoxPrice : undefined)
    ?? product?.estimatedResellPrice
    ?? 0;

  const hasManualFloor = (rule.floorPrice ?? 0) > 0;

  if (currentPrice <= 0) {
    return NextResponse.json(
      { error: 'No price data found for this ASIN — sync your Amazon inventory or run a product scan first.' },
      { status: 400 },
    );
  }
  if (costBasis <= 0 && !hasManualFloor) {
    return NextResponse.json(
      { error: 'No unit cost set and no manual floor price — add a unit cost or floor price to protect your margin.' },
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
    floorPrice:   rule.floorPrice ?? undefined,
  });

  const isActionable = result.direction !== 'HOLD' && result.recommendedPrice !== currentPrice;
  const status       = isActionable ? 'PROPOSED' : 'HOLD';

  await prisma.$transaction([
    // Supersede any stale un-actioned proposal so only the latest shows in the queue
    prisma.repricingHistory.updateMany({
      where: { ruleId: id, status: 'PROPOSED' },
      data:  { status: 'SUPERSEDED' },
    }),
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
        status,
        previousPrice:    currentPrice,
        sku,
        reason:           result.reason,
      },
    }),
  ]);

  return NextResponse.json({ success: true, data: result, status, proposalQueued: isActionable });
}
