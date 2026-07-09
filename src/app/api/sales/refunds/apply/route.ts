import { NextResponse }                  from 'next/server';
import { auth }                          from '@/lib/auth';
import { prisma }                        from '@/lib/prisma';
import {
  classifyRefundSettlementRow,
  buildSaleAdjustmentRecordDraft,
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
      { error: 'Forbidden — only owners and admins can apply refund classifications' },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.confirmed !== true) {
    return NextResponse.json(
      { error: 'confirmed: true is required to apply refund adjustments' },
      { status: 400 },
    );
  }

  const settlementId =
    typeof body.settlementId === 'string' && body.settlementId.trim()
      ? body.settlementId.trim()
      : null;

  const settlementFilter = settlementId ? { settlementId } : {};

  // Fetch stored refund rows for this org
  const refundRecords = await prisma.settlementRecord.findMany({
    where: { orgId, transactionType: 'Refund', ...settlementFilter },
    select: {
      id:              true,
      settlementId:    true,
      transactionType: true,
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

  if (refundRecords.length === 0) {
    return NextResponse.json({
      totalRefundRows:         0,
      createdCount:            0,
      skippedCount:            0,
      alreadyExistsCount:      0,
      orderLevelSkippedCount:  0,
      unmatchedSkippedCount:   0,
      unsupportedSkippedCount: 0,
      invalidAmountSkippedCount: 0,
      message: 'No refund rows found in imported settlements.',
    });
  }

  // Build SaleRecord lookup keyed by orderItemId
  const orderItemCodes = [
    ...new Set(
      refundRecords.map((r) => r.orderItemCode).filter((c): c is string => c !== null),
    ),
  ];

  const saleRecordsRaw = orderItemCodes.length > 0
    ? await prisma.saleRecord.findMany({
        where:  { orgId, orderItemId: { in: orderItemCodes } },
        select: { id: true, orderItemId: true },
      })
    : [];

  const saleByOrderItemId = new Map<string, { id: string; orgId: string }>();
  for (const sr of saleRecordsRaw) {
    if (sr.orderItemId) saleByOrderItemId.set(sr.orderItemId, { id: sr.id, orgId });
  }

  // Pre-check existing SaleAdjustmentRecord rows by settlementRecordId (idempotency)
  const candidateIds = refundRecords.map((r) => r.id);
  const existingAdjustments = await prisma.saleAdjustmentRecord.findMany({
    where:  { settlementRecordId: { in: candidateIds } },
    select: { settlementRecordId: true },
  });
  const existingIds = new Set(
    existingAdjustments
      .map((a) => a.settlementRecordId)
      .filter((id): id is string => id !== null),
  );

  // Classify each refund record and build eligible drafts
  const drafts: ReturnType<typeof buildSaleAdjustmentRecordDraft>[] = [];
  let orderLevelSkippedCount  = 0;
  let alreadyExistsCount      = 0;
  let unmatchedSkippedCount   = 0;
  let unsupportedSkippedCount = 0;
  let invalidAmountSkippedCount = 0;

  for (const record of refundRecords) {
    if (!record.orderItemCode) {
      orderLevelSkippedCount++;
      continue;
    }

    if (existingIds.has(record.id)) {
      alreadyExistsCount++;
      continue;
    }

    const saleRecord = saleByOrderItemId.get(record.orderItemCode);
    if (!saleRecord) {
      unmatchedSkippedCount++;
      continue;
    }

    const classification = classifyRefundSettlementRow({
      transactionType: record.transactionType,
      orderItemCode:   record.orderItemCode,
      priceType:       record.priceType,
      priceAmount:     record.priceAmount,
      itemFeeType:     record.itemFeeType,
      itemFeeAmount:   record.itemFeeAmount,
      otherFeeReason:  record.otherFeeReason,
    });

    if (classification.adjustmentType === 'UNSUPPORTED') {
      unsupportedSkippedCount++;
      continue;
    }

    const draft = buildSaleAdjustmentRecordDraft(classification, record, saleRecord);

    if (!draft) {
      invalidAmountSkippedCount++;
      continue;
    }

    drafts.push(draft);
  }

  // Batch create — skipDuplicates guards against concurrent-request races
  let createdCount = 0;
  if (drafts.length > 0) {
    const eligibleDrafts = drafts.filter((d): d is NonNullable<typeof d> => d !== null);
    const result = await prisma.saleAdjustmentRecord.createMany({
      data:           eligibleDrafts,
      skipDuplicates: true,
    });
    createdCount = result.count;
  }

  const skippedCount =
    orderLevelSkippedCount +
    unmatchedSkippedCount +
    unsupportedSkippedCount +
    invalidAmountSkippedCount;

  return NextResponse.json({
    totalRefundRows:           refundRecords.length,
    createdCount,
    skippedCount,
    alreadyExistsCount,
    orderLevelSkippedCount,
    unmatchedSkippedCount,
    unsupportedSkippedCount,
    invalidAmountSkippedCount,
  });
}
