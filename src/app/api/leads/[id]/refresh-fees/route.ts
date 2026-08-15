import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { leadAccessWhere } from '@/lib/lead-access';
import { getFeeEstimate } from '@/lib/amazon';
import { isRateLimited, recordAttempt } from '@/lib/rate-limit';

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

  // amazonFees is intentionally NOT updated here. The profitability engine
  // defines amazonFees = referralFee + fbaFee + storageFee (profitability.ts:96).
  // getFeeEstimate does not return storageFee, so computing amazonFees here
  // would undercount it and cause profit/roi to drift from their stored values.
  // Full profitability recalculation is deferred to a future phase.
  await prisma.product.updateMany({
    where: { id: product.id, orgId },
    data: {
      referralFee:          freshFees.referralFee,
      fbaFee:               freshFees.fbaFee,
      feeEstimateSource:    'SP_API',
      feeEstimatedAt:       new Date(),
      feeEstimatePrice:     resellPrice,
      feeEstimateConfirmed: true,
    },
  });

  return NextResponse.json({ ok: true, status: 'REFRESHED' });
}
