import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { leadAccessWhere } from '@/lib/lead-access';
import { getFeeEstimate } from '@/lib/amazon';
import { isRateLimited, recordAttempt } from '@/lib/rate-limit';
import { calculateProfitability } from '@/engines/profitability';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const orgId = session.user.orgId;

  const org = await prisma.organization.findUnique({
    where:  { id: orgId },
    select: { isBroadcastSource: true },
  });
  const isBroadcastSource = org?.isBroadcastSource ?? false;

  const lead = await prisma.lead.findFirst({
    where: { id, ...leadAccessWhere({ orgId, isBroadcastSource }) },
    select: {
      product: {
        select: {
          id:             true,
          orgId:          true,
          asin:           true,
          lowestFbaPrice: true,
          buyBoxPrice:    true,
          sourcePrice:    true,
          sourceTaxRate:  true,
          storageFee:     true,
          prepFee:        true,
          category:       true,
        },
      },
    },
  });

  if (!lead?.product) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const product = lead.product;

  // Cross-org write guard: leadAccessWhere already scopes to orgId, but this
  // explicit check ensures a future access-control bug can never produce a
  // write to another org's Product record.
  if (product.orgId !== orgId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const resellPrice = product.lowestFbaPrice ?? product.buyBoxPrice;
  if (!resellPrice || resellPrice <= 0) {
    return NextResponse.json({ error: 'NO_RESELL_PRICE' }, { status: 422 });
  }

  const rl = await isRateLimited(`fee-refresh:${orgId}`, 10, 3600);
  if (rl.limited) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  // Record before the SP-API call so throttling applies even when SP-API is
  // unavailable — prevents unlimited retries during an outage.
  await recordAttempt(`fee-refresh:${orgId}`, 3600);

  const freshFees = await getFeeEstimate(orgId, product.asin, resellPrice).catch(() => null);

  if (!freshFees) {
    return NextResponse.json({ ok: true, status: 'SP_API_UNAVAILABLE' });
  }

  const feeMetadata = {
    referralFee:          freshFees.referralFee,
    fbaFee:               freshFees.fbaFee,
    feeEstimateSource:    'SP_API',
    feeEstimatedAt:       new Date(),
    feeEstimatePrice:     resellPrice,
    feeEstimateConfirmed: true,
  };

  // Without sourcePrice we cannot recompute profit/roi/margin — write fee
  // metadata only and signal to the caller that profit was not recalculated.
  if (product.sourcePrice == null) {
    await prisma.product.updateMany({
      where: { id: product.id, orgId },
      data:  feeMetadata,
    });
    return NextResponse.json({ ok: true, status: 'REFRESHED_FEES_ONLY', profitUpdated: false, warning: 'MISSING_SOURCE_PRICE' });
  }

  // storageFee is stored from the original pipeline run (default 0.50 there).
  // We use the stored value so amazonFees = referralFee + fbaFee + storageFee
  // is computed consistently with the original calculation.
  const storageFee = product.storageFee ?? 0.50;
  const prepFee    = product.prepFee    ?? 1.50;

  const recalc = calculateProfitability({
    sourcePrice:     product.sourcePrice,
    taxRate:         product.sourceTaxRate != null ? Number(product.sourceTaxRate) : undefined,
    discounts:       [],
    resellPrice,
    category:        product.category ?? 'Other',
    referralFeeRate: freshFees.referralFee / resellPrice,
    fbaFee:          freshFees.fbaFee,
    storageFee,
    prepFee,
  });

  await prisma.product.updateMany({
    where: { id: product.id, orgId },
    data: {
      ...feeMetadata,
      amazonFees:     recalc.amazonFees,
      fees:           recalc.amazonFees + recalc.prepFee + recalc.taxAmount,
      profit:         recalc.profit,
      roi:            recalc.roi,
      margin:         recalc.margin,
      finalCost:      recalc.finalCost,
      totalLandedCost: recalc.totalLandedCost,
      taxAmount:      recalc.taxAmount,
    },
  });

  return NextResponse.json({ ok: true, status: 'REFRESHED', profitUpdated: true });
}
