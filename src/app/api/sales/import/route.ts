import { NextResponse } from 'next/server';
import { auth }         from '@/lib/auth';
import { prisma }       from '@/lib/prisma';
import { parseSalesReport, resolveSaleCost, computeSaleProfit } from '@/engines/salesTracking';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { role, orgId, plan } = session.user;

  if (plan === 'STARTER') {
    return NextResponse.json({ error: 'Sales & Profit Tracking requires a Pro plan' }, { status: 403 });
  }
  if (role !== 'OWNER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden — only owners and admins can import sales reports' }, { status: 403 });
  }

  // Accept multipart/form-data with a "file" field OR raw text body
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

  // Create sync log
  const syncLog = await prisma.salesSync.create({
    data: { orgId, source: 'MANUAL_CSV', status: 'RUNNING' },
  });

  try {
    const { rows, errors, total, skipped, currencySkipped } = parseSalesReport(rawText);

    if (rows.length === 0 && errors.length > 0) {
      await prisma.salesSync.update({
        where: { id: syncLog.id },
        data: {
          status:       'FAILED',
          completedAt:  new Date(),
          recordsFound: total,
          error: `All ${errors.length} rows failed to parse. First error: ${errors[0].message}`,
        },
      });
      return NextResponse.json(
        { error: 'No valid rows found', parseErrors: errors.slice(0, 10) },
        { status: 422 },
      );
    }

    if (rows.length === 0) {
      // All rows were skipped (Cancelled/Pending)
      await prisma.salesSync.update({
        where: { id: syncLog.id },
        data: {
          status: 'DONE', completedAt: new Date(),
          recordsFound: total, recordsUpserted: 0,
        },
      });
      return NextResponse.json({ imported: 0, created: 0, updated: 0, skipped, currencySkipped, parseErrors: 0, total, syncId: syncLog.id });
    }

    // Collect all ASINs and SKUs for cost lookups
    const asins = [...new Set(rows.map((r) => r.asin).filter(Boolean))] as string[];
    const skus  = [...new Set(rows.map((r) => r.sku).filter(Boolean))]  as string[];

    // Parallel cost lookups across all relevant tables
    const [invItemsByAsin, invItemsBySku, repricingRules, products, poItems] = await Promise.all([
      asins.length > 0
        ? prisma.inventoryItem.findMany({
            where:  { orgId, asin: { in: asins } },
            select: { asin: true, sku: true, unitCost: true },
          })
        : Promise.resolve([]),

      // Fulfilled Shipments reports have no ASIN — look up inventory by SKU as fallback
      skus.length > 0
        ? prisma.inventoryItem.findMany({
            where:  { orgId, sku: { in: skus } },
            select: { asin: true, sku: true, unitCost: true },
          })
        : Promise.resolve([]),

      asins.length > 0
        ? prisma.repricingRule.findMany({
            where:  { orgId, asin: { in: asins } },
            select: { asin: true, costBasis: true },
          })
        : Promise.resolve([]),

      asins.length > 0
        ? prisma.product.findMany({
            where:  { orgId, asin: { in: asins } },
            select: { asin: true, totalLandedCost: true, sourcePrice: true },
          })
        : Promise.resolve([]),

      // PO items matched by SKU (most reliable cost source)
      skus.length > 0
        ? prisma.purchaseOrderItem.findMany({
            where:   { orgId, sku: { in: skus } },
            orderBy: { createdAt: 'desc' },
            select:  { sku: true, asin: true, unitCost: true },
          })
        : Promise.resolve([]),
    ]);

    // Build lookup maps (ASIN/SKU → cost)
    // ASIN-first within InventoryItem; SKU used as fallback for rows where asin is null
    const invByAsin = new Map(invItemsByAsin.map((i) => [i.asin, i.unitCost]));
    const invBySku  = new Map(
      invItemsBySku
        .filter((i): i is typeof i & { sku: string } => i.sku != null)
        .map((i) => [i.sku, i.unitCost]),
    );
    const repByAsin  = new Map(repricingRules.map((r) => [r.asin, r.costBasis]));
    const prodByAsin = new Map(products.map((p) => [p.asin, p]));
    // PO: prefer most recent item with non-null cost, by sku then asin
    const poBySkuOrAsin = new Map<string, number>();
    for (const poi of poItems) {
      if (poi.unitCost == null) continue;
      if (poi.sku && !poBySkuOrAsin.has(`sku:${poi.sku}`))    poBySkuOrAsin.set(`sku:${poi.sku}`,   poi.unitCost);
      if (poi.asin && !poBySkuOrAsin.has(`asin:${poi.asin}`)) poBySkuOrAsin.set(`asin:${poi.asin}`, poi.unitCost);
    }

    // Pre-query existing rows to:
    //   (a) distinguish creates from updates in the response counts
    //   (b) preserve settlement fee data on orders re-import (orders report has no fees)
    //
    // Settlement import is the sole authority for referralFee/fbaFee/otherFees/totalFees.
    // Re-importing an orders report must NEVER overwrite those fields with null.
    const existingRows = await prisma.saleRecord.findMany({
      where:  { orgId, dedupKey: { in: rows.map((r) => r.dedupKey) } },
      select: {
        dedupKey:    true,
        referralFee: true,
        fbaFee:      true,
        otherFees:   true,
        totalFees:   true,
      },
    });
    const existingKeys      = new Set(existingRows.map((r) => r.dedupKey));
    const existingFeesByKey = new Map(existingRows.map((r) => [r.dedupKey, r]));

    let upserted = 0;
    let created  = 0;
    let updated  = 0;

    for (const row of rows) {
      // Resolve cost using priority chain:
      //   PO_ITEM → INVENTORY (ASIN then SKU) → REPRICING → PRODUCT
      const poCost =
        (row.sku  ? poBySkuOrAsin.get(`sku:${row.sku}`)   : undefined) ??
        (row.asin ? poBySkuOrAsin.get(`asin:${row.asin}`) : undefined) ??
        null;

      const prod = row.asin ? prodByAsin.get(row.asin) : undefined;

      // Resolve inventory cost: prefer ASIN match; fall back to SKU match.
      // This handles Fulfilled Shipments rows which carry Merchant SKU but no ASIN.
      const inventoryUnitCost =
        (row.asin ? invByAsin.get(row.asin) ?? undefined : undefined) ??
        (row.sku  ? invBySku.get(row.sku)   ?? undefined : undefined) ??
        null;

      const costResolved = resolveSaleCost({
        poItemUnitCost:         poCost,
        inventoryUnitCost,
        repricingCostBasis:     row.asin ? (repByAsin.get(row.asin) ?? null) : null,
        productTotalLandedCost: prod?.totalLandedCost ?? null,
        productSourcePrice:     prod?.sourcePrice     ?? null,
      });

      // createData — used for brand-new rows only.
      // Fee fields initialise as null; settlement import will fill them later.
      const createProfit = computeSaleProfit(row.netRevenue, row.quantitySold, null, costResolved);

      const createData = {
        orderItemId:           row.orderItemId,
        amazonOrderId:         row.amazonOrderId,
        asin:                  row.asin,
        sku:                   row.sku,
        productName:           row.productName,
        saleDate:              row.saleDate,
        quantitySold:          row.quantitySold,
        grossRevenue:          row.grossRevenue,
        itemTax:               row.itemTax,
        promotionDiscount:     row.promotionDiscount,
        netRevenue:            row.netRevenue,
        fulfillmentChannel:    row.fulfillmentChannel,
        orderStatus:           row.orderStatus,
        referralFee:           null,
        fbaFee:                null,
        otherFees:             null,
        totalFees:             null,
        unitCostUsed:          createProfit.unitCostUsed,
        costSource:            createProfit.costSource,
        cogs:                  createProfit.cogs,
        grossProfitBeforeFees: createProfit.grossProfitBeforeFees,
        grossRoiBeforeFees:    createProfit.grossRoiBeforeFees,
        realizedProfit:        createProfit.realizedProfit,
        roi:                   createProfit.roi,
        importSource:          'MANUAL_CSV' as const,
        rawPayload:            row.rawPayload,
      };

      // updateData — used for already-existing rows.
      // Fee fields are PRESERVED from what settlement import previously wrote.
      // Recompute realizedProfit/roi using those preserved fees + freshly resolved cost.
      const existingFees   = existingFeesByKey.get(row.dedupKey);
      const preservedFees  = existingFees?.totalFees ?? null;
      const updateProfit   = computeSaleProfit(row.netRevenue, row.quantitySold, preservedFees, costResolved);

      const updateData = {
        orderItemId:           row.orderItemId,
        amazonOrderId:         row.amazonOrderId,
        asin:                  row.asin,
        sku:                   row.sku,
        productName:           row.productName,
        saleDate:              row.saleDate,
        quantitySold:          row.quantitySold,
        grossRevenue:          row.grossRevenue,
        itemTax:               row.itemTax,
        promotionDiscount:     row.promotionDiscount,
        netRevenue:            row.netRevenue,
        fulfillmentChannel:    row.fulfillmentChannel,
        orderStatus:           row.orderStatus,
        // Fee fields intentionally omitted — settlement import is sole authority
        unitCostUsed:          updateProfit.unitCostUsed,
        costSource:            updateProfit.costSource,
        cogs:                  updateProfit.cogs,
        grossProfitBeforeFees: updateProfit.grossProfitBeforeFees,
        grossRoiBeforeFees:    updateProfit.grossRoiBeforeFees,
        realizedProfit:        updateProfit.realizedProfit,
        roi:                   updateProfit.roi,
        importSource:          'MANUAL_CSV' as const,
        rawPayload:            row.rawPayload,
      };

      await prisma.saleRecord.upsert({
        where:  { orgId_dedupKey: { orgId, dedupKey: row.dedupKey } },
        create: { orgId, dedupKey: row.dedupKey, ...createData },
        update: updateData,
      });

      if (existingKeys.has(row.dedupKey)) { updated++; } else { created++; }
      upserted++;
    }

    await prisma.salesSync.update({
      where: { id: syncLog.id },
      data: {
        status:          'DONE',
        completedAt:     new Date(),
        recordsFound:    total,
        recordsUpserted: upserted,
      },
    });

    return NextResponse.json({
      imported:        upserted,
      created,
      updated,
      skipped,
      currencySkipped,
      parseErrors:     errors.length,
      total,
      syncId:          syncLog.id,
      ...(errors.length > 0        && { rowErrors: errors.slice(0, 10) }),
      ...(currencySkipped > 0      && { currencySkippedNote: `${currencySkipped} row${currencySkipped !== 1 ? 's' : ''} skipped — unsupported currency (non-USD)` }),
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[sales/import] failed:', err);

    await prisma.salesSync.update({
      where: { id: syncLog.id },
      data: { status: 'FAILED', completedAt: new Date(), error: message },
    }).catch(() => {});

    return NextResponse.json({ error: 'Import failed', detail: message }, { status: 500 });
  }
}
