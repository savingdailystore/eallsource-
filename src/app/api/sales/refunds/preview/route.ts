import { NextResponse }              from 'next/server';
import { auth }                      from '@/lib/auth';
import { prisma }                    from '@/lib/prisma';
import {
  previewRefundClassification,
  type ParsedSettlementRow,
  type RefundPreviewSaleRecord,
} from '@/engines/salesTracking';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { role, orgId, plan } = session.user;

  if (plan === 'STARTER') {
    return NextResponse.json(
      { error: 'Settlement data requires a Pro plan' },
      { status: 403 },
    );
  }
  if (role !== 'OWNER' && role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Forbidden — only owners and admins can preview refund classification' },
      { status: 403 },
    );
  }

  let settlementId: string | null = null;
  try {
    const body = await req.json() as Record<string, unknown>;
    if (typeof body.settlementId === 'string' && body.settlementId.trim()) {
      settlementId = body.settlementId.trim();
    }
  } catch {
    // body is optional — empty or non-JSON body is fine
  }

  // Query stored refund rows for this org
  const settlementFilter = settlementId ? { settlementId } : {};
  const storedRefundRecords = await prisma.settlementRecord.findMany({
    where: { orgId, transactionType: 'Refund', ...settlementFilter },
    select: {
      id:              true,
      dedupKey:        true,
      settlementId:    true,
      transactionType: true,
      postedDate:      true,
      orderId:         true,
      orderItemCode:   true,
      sku:             true,
      priceType:       true,
      priceAmount:     true,
      itemFeeType:     true,
      itemFeeAmount:   true,
      otherFeeReason:  true,
    },
  });

  if (storedRefundRecords.length === 0) {
    return NextResponse.json({
      totalRefundRows: 0,
      itemLevelRows:   0,
      orderLevelRows:  0,
      matchedGroups:   [],
      unmatchedGroups: [],
      skippedRows:     [],
      sampleRows:      [],
      warnings:        [],
      message:         'No refund rows found in imported settlements.',
    });
  }

  // Map stored records to ParsedSettlementRow shape (engine uses the same field set)
  const refundRows: ParsedSettlementRow[] = storedRefundRecords.map((r) => ({
    dedupKey:        r.dedupKey,
    settlementId:    r.settlementId,
    transactionType: r.transactionType,
    postedDate:      r.postedDate,
    orderId:         r.orderId,
    orderItemCode:   r.orderItemCode,
    sku:             r.sku,
    priceType:       r.priceType,
    priceAmount:     r.priceAmount,
    itemFeeType:     r.itemFeeType,
    itemFeeAmount:   r.itemFeeAmount,
    otherFeeReason:  r.otherFeeReason,
    rawPayload:      {},
  }));

  // Collect the orderItemCodes we need to match against SaleRecords
  const orderItemCodes = [
    ...new Set(
      refundRows.map((r) => r.orderItemCode).filter((c): c is string => c !== null),
    ),
  ];

  const saleRecordsRaw = orderItemCodes.length > 0
    ? await prisma.saleRecord.findMany({
        where:  { orgId, orderItemId: { in: orderItemCodes } },
        select: { id: true, orderItemId: true, sku: true, realizedProfit: true },
      })
    : [];

  const saleRecords: RefundPreviewSaleRecord[] = saleRecordsRaw.map((r) => ({
    id:             r.id,
    orderItemId:    r.orderItemId,
    sku:            r.sku,
    realizedProfit: r.realizedProfit,
  }));

  const preview = previewRefundClassification(refundRows, saleRecords);

  // Build sample rows — up to 10 from matched groups
  const sampleRows = preview.matchedGroups.slice(0, 10).map((g) => ({
    orderItemCode: g.orderItemCode,
    saleRecordId:  g.saleRecordId,
    classifications: g.classifications.map((c) => ({
      adjustmentType: c.adjustmentType,
      amountCategory: c.amountCategory,
      amount:         c.amount,
      profitImpact:   c.profitImpact,
    })),
  }));

  return NextResponse.json({
    totalRefundRows:   preview.totalRefundRows,
    itemLevelRows:     preview.itemLevelRows,
    orderLevelRows:    preview.orderLevelRows,
    matchedCount:      preview.matchedGroups.length,
    unmatchedCount:    preview.unmatchedGroups.length,
    skippedCount:      preview.skippedRows.length,
    sampleRows,
    warnings:          preview.warnings,
  });
}
