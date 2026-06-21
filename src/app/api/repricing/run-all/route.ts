import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateReprice } from '@/engines/repricing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.user.plan === 'STARTER') {
    return NextResponse.json({ error: 'Repricing requires a PRO or ENTERPRISE plan' }, { status: 403 });
  }
  if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const orgId = session.user.orgId;

  // ── 1. Auto-create rules from inventory items that don't have one ──────────
  const [inventory, existingRules] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { orgId } }),
    prisma.repricingRule.findMany({ where: { orgId }, select: { asin: true } }),
  ]);

  const ruledAsins = new Set(existingRules.map((r) => r.asin));
  const seen       = new Set<string>();
  let created      = 0;

  for (const item of inventory) {
    if (ruledAsins.has(item.asin) || seen.has(item.asin)) continue;
    seen.add(item.asin);
    await prisma.repricingRule.create({
      data: { orgId, asin: item.asin, title: item.productName, minRoi: 30, minProfit: 5, strategy: 'COMPETITIVE' },
    });
    created++;
  }

  // Map ASIN → seller SKU from synced inventory. A price push targets a SKU
  // (a listing), not an ASIN, so a rule with no matching SKU can be proposed
  // but not pushed until inventory is synced.
  const skuByAsin = new Map<string, string>();
  for (const item of inventory) {
    if (item.sku && !skuByAsin.has(item.asin)) skuByAsin.set(item.asin, item.sku);
  }

  // ── 2. Run every active rule ──────────────────────────────────────────────
  const rules = await prisma.repricingRule.findMany({ where: { orgId, isActive: true } });

  let proposed = 0; // actionable price changes awaiting approval
  let hold     = 0; // ran fine, no change recommended
  let skipped  = 0; // no market data to price against

  for (const rule of rules) {
    const product = await prisma.product.findFirst({ where: { orgId, asin: rule.asin } });

    // Repricing requires scanned Amazon market data (buy box, cost, resale price).
    const costBasis    = product?.totalLandedCost ?? product?.sourcePrice ?? 0;
    // Prefer the price we last pushed live, then the last recommendation, then
    // the scanned resale price, as our best guess of the current live price.
    const currentPrice = rule.lastPushedPrice ?? rule.lastRecommendedPrice ?? product?.estimatedResellPrice ?? 0;
    const buyBoxPrice  = product?.buyBoxPrice ?? 0;
    const fbaSellers   = product?.fbaSellers ?? 0;

    // Can't compute anything meaningful without a cost and a price.
    if (costBasis <= 0 || currentPrice <= 0) { skipped++; continue; }

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

    // A change is only actionable if the price actually moves.
    const isActionable = result.direction !== 'HOLD' && result.recommendedPrice !== currentPrice;
    const status       = isActionable ? 'PROPOSED' : 'HOLD';
    const sku          = skuByAsin.get(rule.asin) ?? null;

    await prisma.$transaction([
      // Supersede any earlier un-actioned proposal so the queue shows only the
      // latest recommendation per rule.
      prisma.repricingHistory.updateMany({
        where: { ruleId: rule.id, status: 'PROPOSED' },
        data:  { status: 'SUPERSEDED' },
      }),
      prisma.repricingRule.update({
        where: { id: rule.id },
        data: {
          lastRecommendedPrice: result.recommendedPrice,
          lastDirection:        result.direction,
          lastRepricedAt:       new Date(),
        },
      }),
      prisma.repricingHistory.create({
        data: {
          ruleId:           rule.id,
          buyBoxPrice:      buyBoxPrice || null,
          recommendedPrice: result.recommendedPrice,
          direction:        result.direction,
          riskScore:        result.riskScore,
          status,
          previousPrice:    currentPrice,
          sku,
        },
      }),
    ]);

    if (isActionable) proposed++;
    else hold++;
  }

  return NextResponse.json({ success: true, created, proposed, hold, skipped });
}
