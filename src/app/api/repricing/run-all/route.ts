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
    prisma.inventoryItem.findMany({ where: { orgId, status: { not: 'SOLD' } } }),
    prisma.repricingRule.findMany({ where: { orgId }, select: { asin: true } }),
  ]);

  const ruledAsins = new Set(existingRules.map((r) => r.asin));
  const seen       = new Set<string>();
  let created      = 0;

  for (const item of inventory) {
    if (ruledAsins.has(item.asin) || seen.has(item.asin)) continue;
    seen.add(item.asin);
    await prisma.repricingRule.create({
      data: { orgId, asin: item.asin, title: item.title, minRoi: 30, minProfit: 5, strategy: 'COMPETITIVE' },
    });
    created++;
  }

  // ── 2. Run every active rule ──────────────────────────────────────────────
  const rules = await prisma.repricingRule.findMany({ where: { orgId, isActive: true } });

  let repriced = 0;
  let skipped  = 0;

  for (const rule of rules) {
    const product = await prisma.product.findFirst({ where: { orgId, asin: rule.asin } });
    const inv     = inventory.find((i) => i.asin === rule.asin);

    // Prefer scanned Amazon market data; fall back to manually-entered inventory.
    const costBasis    = product?.totalLandedCost ?? product?.sourcePrice ?? inv?.costBasis ?? 0;
    const currentPrice = rule.lastRecommendedPrice ?? product?.estimatedResellPrice ?? inv?.listedPrice ?? 0;
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
    });

    await prisma.$transaction([
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
        },
      }),
    ]);
    repriced++;
  }

  return NextResponse.json({ success: true, created, repriced, skipped });
}
