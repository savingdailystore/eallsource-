import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateReprice } from '@/engines/repricing';
import { getProductData } from '@/lib/amazon';
import { getListingMarket } from '@/lib/amazon-listings';

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
  // Map ASIN → availableQuantity for zero-inventory guard.
  const qtyByAsin = new Map<string, number>();
  for (const item of inventory) {
    if (item.sku && !skuByAsin.has(item.asin)) skuByAsin.set(item.asin, item.sku);
    if (!qtyByAsin.has(item.asin)) qtyByAsin.set(item.asin, item.availableQuantity ?? 0);
  }

  // ── 2. Run every active rule ──────────────────────────────────────────────
  const rules = await prisma.repricingRule.findMany({ where: { orgId, isActive: true } });

  let proposed = 0; // actionable price changes awaiting approval
  let hold     = 0; // ran fine, no change recommended
  let noPrice  = 0; // couldn't determine a current/market price to act on
  let noCost   = 0; // no cost basis and no manual floor → can't protect margin

  for (const rule of rules) {
    const product = await prisma.product.findFirst({ where: { orgId, asin: rule.asin } });
    const sku     = skuByAsin.get(rule.asin) ?? null;

    // Guard 1: zero-inventory — emit HOLD instead of a proposal when the
    // inventory record exists but has nothing on hand.  If there is no local
    // inventory record (qtyByAsin has no entry) we fall through and let the
    // normal price-data checks handle it.
    const availableQty = qtyByAsin.has(rule.asin) ? (qtyByAsin.get(rule.asin) ?? 0) : null;
    if (availableQty !== null && availableQty <= 0) {
      const holdPrice = rule.lastPushedPrice ?? rule.lastRecommendedPrice ?? 0;
      await prisma.$transaction([
        prisma.repricingHistory.updateMany({
          where: { ruleId: rule.id, status: 'PROPOSED' },
          data:  { status: 'SUPERSEDED' },
        }),
        prisma.repricingRule.update({
          where: { id: rule.id },
          data:  { lastRepricedAt: new Date(), lastDirection: 'HOLD' },
        }),
        prisma.repricingHistory.create({
          data: {
            ruleId:           rule.id,
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
      hold++;
      continue;
    }

    // Most repricing targets are the seller's OWN inventory, which was never run
    // through the sourcing scanner — so there's no Product row. Pull live market
    // data from Amazon (buy box, sellers) and the seller's current listing price
    // so owned inventory can be repriced, not just scanned leads.
    let liveBuyBox:  number | undefined;
    let liveSellers: number | undefined;
    let liveCurrent: number | undefined;

    if (!product?.buyBoxPrice) {
      const live = await getProductData(orgId, rule.asin).catch(() => null);
      liveBuyBox  = live?.buyBoxPrice ?? live?.lowestFbaPrice;
      liveSellers = live?.fbaSellers;
    }
    if (sku) {
      const listing = await getListingMarket(orgId, sku);
      liveCurrent = listing.currentPrice;
    }

    // Cost basis: the rule's stored cost, else scanned product cost.
    const costBasis    = rule.costBasis ?? product?.totalLandedCost ?? product?.sourcePrice ?? 0;
    const buyBoxPrice  = product?.buyBoxPrice ?? liveBuyBox ?? 0;
    const fbaSellers   = product?.fbaSellers ?? liveSellers ?? 0;
    // Best estimate of the current live price: last price we pushed, then the
    // seller's live listing price, then buy box, then the scanned resale price.
    const currentPrice =
      rule.lastPushedPrice
      ?? liveCurrent
      ?? (buyBoxPrice > 0 ? buyBoxPrice : undefined)
      ?? product?.estimatedResellPrice
      ?? 0;

    const hasManualFloor = (rule.floorPrice ?? 0) > 0;

    // Need a price to act on at all.
    if (currentPrice <= 0) { noPrice++; continue; }
    // Without a cost basis we can't compute the ROI/profit floor, so the only
    // safe protection is a manual floor. Require one or skip — never push a
    // price we can't prove is profitable.
    if (costBasis <= 0 && !hasManualFloor) { noCost++; continue; }

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
          reason:           result.reason,
        },
      }),
    ]);

    if (isActionable) proposed++;
    else hold++;
  }

  return NextResponse.json({ success: true, created, proposed, hold, noPrice, noCost });
}
