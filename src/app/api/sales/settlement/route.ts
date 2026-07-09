import { NextResponse }                   from 'next/server';
import { auth }                           from '@/lib/auth';
import { prisma }                         from '@/lib/prisma';
import { parseSettlementReport, computeSaleProfit, detectSettlementFileTypeError, type CostSource } from '@/engines/salesTracking';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { role, orgId, plan } = session.user;

  if (plan === 'STARTER') {
    return NextResponse.json({ error: 'Settlement import requires a Pro plan' }, { status: 403 });
  }
  if (role !== 'OWNER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden — only owners and admins can import settlement reports' }, { status: 403 });
  }

  let rawText: string;
  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
    }
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Missing file field in multipart upload' }, { status: 400 });
    }
    const bytes = await (file as File).arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds 5 MB limit' }, { status: 413 });
    }
    rawText = new TextDecoder().decode(bytes);
  } else {
    const bytes = await req.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Body exceeds 5 MB limit' }, { status: 413 });
    }
    rawText = new TextDecoder().decode(bytes);
  }

  if (!rawText.trim()) {
    return NextResponse.json({ error: 'Empty file — nothing to import' }, { status: 400 });
  }

  // File-type guard — must run before any DB writes so no bogus rows are stored
  const fileTypeError = detectSettlementFileTypeError(rawText);
  if (fileTypeError) {
    return NextResponse.json({ error: fileTypeError.message }, { status: 422 });
  }

  const syncLog = await prisma.salesSync.create({
    data: { orgId, source: 'MANUAL_SETTLEMENT', status: 'RUNNING' },
  });

  try {
    const parsed = parseSettlementReport(rawText);

    if (parsed.allRows.length === 0 && parsed.errors.length > 0) {
      await prisma.salesSync.update({
        where: { id: syncLog.id },
        data: {
          status: 'FAILED', completedAt: new Date(),
          recordsFound: parsed.rowsParsed,
          error: `All ${parsed.errors.length} rows failed to parse. First: ${parsed.errors[0].message}`,
        },
      });
      return NextResponse.json(
        { error: 'No valid rows found', parseErrors: parsed.errors.slice(0, 10) },
        { status: 422 },
      );
    }

    // Pre-fetch existing dedupKeys for created/updated tracking
    const allDedupKeys = parsed.allRows.map((r) => r.dedupKey);
    const existingKeys = new Set(
      (await prisma.settlementRecord.findMany({
        where:  { orgId, dedupKey: { in: allDedupKeys } },
        select: { dedupKey: true },
      })).map((r) => r.dedupKey),
    );

    let created  = 0;
    let updated  = 0;
    let matched  = 0;
    let unmatched = 0;

    // Upsert all rows as SettlementRecord (idempotent by dedupKey)
    for (const row of parsed.allRows) {
      const data = {
        settlementId:    row.settlementId,
        transactionType: row.transactionType,
        postedDate:      row.postedDate,
        orderId:         row.orderId,
        orderItemCode:   row.orderItemCode,
        sku:             row.sku,
        priceType:       row.priceType,
        priceAmount:     row.priceAmount,
        itemFeeType:     row.itemFeeType,
        itemFeeAmount:   row.itemFeeAmount,
        otherFeeReason:  row.otherFeeReason,
        importSource:    'MANUAL_CSV' as const,
        rawPayload:      row.rawPayload,
      };

      await prisma.settlementRecord.upsert({
        where:  { orgId_dedupKey: { orgId, dedupKey: row.dedupKey } },
        create: { orgId, dedupKey: row.dedupKey, ...data },
        update: data,
      });

      if (existingKeys.has(row.dedupKey)) { updated++; } else { created++; }
    }

    // Apply fee groups to SaleRecord rows (Order rows only)
    for (const [orderItemCode, group] of parsed.feeGroups) {
      // Primary match: by orderItemId (order-item-code)
      const sale = await prisma.saleRecord.findFirst({
        where: { orgId, orderItemId: orderItemCode },
      });

      if (!sale) {
        unmatched++;
        continue;
      }

      matched++;

      // Recompute profit with new fee data
      const profit = computeSaleProfit(
        sale.netRevenue,
        sale.quantitySold,
        group.totalFees,
        { cost: sale.unitCostUsed, source: sale.costSource as CostSource | null },
      );

      await prisma.saleRecord.update({
        where: { id: sale.id },
        data: {
          referralFee:          group.referralFee,
          fbaFee:               group.fbaFee,
          otherFees:            group.otherFees,
          totalFees:            group.totalFees,
          realizedProfit:       profit.realizedProfit,
          roi:                  profit.roi,
        },
      });

      // Mark settlement rows for this orderItemCode as matched
      await prisma.settlementRecord.updateMany({
        where: { orgId, orderItemCode, matchedSaleRecordId: null },
        data:  { matchedSaleRecordId: sale.id },
      });
    }

    await prisma.salesSync.update({
      where: { id: syncLog.id },
      data: {
        status:          'DONE',
        completedAt:     new Date(),
        recordsFound:    parsed.rowsParsed,
        recordsUpserted: created + updated,
      },
    });

    const remainingMissingFeesCount = await prisma.saleRecord.count({
      where: { orgId, totalFees: null },
    });

    return NextResponse.json({
      rows:                    parsed.allRows.length,
      created,
      updated,
      orderRows:               parsed.orderRows.length,
      refundRows:              parsed.refundCount,
      unsupportedRows:         parsed.unsupportedCount,
      feeGroupsFound:          parsed.feeGroups.size,
      matched,
      unmatched,
      parseErrors:             parsed.parseErrors,
      syncId:                  syncLog.id,
      remainingMissingFeesCount,
      ...(parsed.errors.length > 0 && { rowErrors: parsed.errors.slice(0, 10) }),
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[sales/settlement] failed:', err);

    await prisma.salesSync.update({
      where: { id: syncLog.id },
      data: { status: 'FAILED', completedAt: new Date(), error: message },
    }).catch(() => {});

    return NextResponse.json({ error: 'Import failed', detail: message }, { status: 500 });
  }
}
