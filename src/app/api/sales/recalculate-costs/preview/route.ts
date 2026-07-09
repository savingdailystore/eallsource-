import { NextResponse }                        from 'next/server';
import { auth }                               from '@/lib/auth';
import { prisma }                             from '@/lib/prisma';
import { previewInventoryCostRecalculation }  from '@/engines/salesTracking';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { role, orgId } = session.user;
  if (role !== 'OWNER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden — only owners and admins can preview cost recalculation' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sku = typeof (body as Record<string, unknown>).sku === 'string'
    ? ((body as Record<string, unknown>).sku as string).trim()
    : null;

  if (!sku) {
    return NextResponse.json({ error: 'sku is required' }, { status: 400 });
  }

  // Validate inventory item — exactly one with positive cost required
  const inventoryItems = await prisma.inventoryItem.findMany({
    where:  { orgId, sku },
    select: { id: true, sku: true, unitCost: true },
  });

  if (inventoryItems.length === 0) {
    return NextResponse.json(
      { error: `No inventory item found for SKU "${sku}". Add one with a unit cost first.` },
      { status: 400 },
    );
  }

  if (inventoryItems.length > 1) {
    return NextResponse.json(
      { error: `Multiple inventory items found for SKU "${sku}". Resolve the duplicate before recalculating.` },
      { status: 409 },
    );
  }

  const inventoryItem = inventoryItems[0];

  if (inventoryItem.unitCost == null || inventoryItem.unitCost <= 0) {
    return NextResponse.json(
      { error: `Inventory item for SKU "${sku}" has no valid unit cost. Set a positive unit cost first.` },
      { status: 400 },
    );
  }

  // Fetch all sale records for this org + SKU where cost is missing
  const saleRecords = await prisma.saleRecord.findMany({
    where:  { orgId, sku },
    select: {
      id:           true,
      sku:          true,
      asin:         true,
      quantitySold: true,
      netRevenue:   true,
      totalFees:    true,
      unitCostUsed: true,
      orderStatus:  true,
      productName:  true,
      saleDate:     true,
    },
  });

  const { eligible, skipped, projections, warnings } =
    previewInventoryCostRecalculation(saleRecords, inventoryItem);

  // Build sample rows for the UI — up to 5 eligible rows
  const sampleRows = eligible.slice(0, 5).map((r) => {
    const proj = projections.get(r.id)!;
    const fullRecord = saleRecords.find((s) => s.id === r.id)!;
    return {
      id:                    r.id,
      sku:                   r.sku,
      asin:                  r.asin,
      productName:           (fullRecord as typeof fullRecord & { productName: string | null }).productName,
      saleDate:              (fullRecord as typeof fullRecord & { saleDate: Date }).saleDate.toISOString(),
      quantitySold:          r.quantitySold,
      netRevenue:            r.netRevenue,
      totalFees:             r.totalFees,
      currentStatus:         'NO_PROFIT_DATA',
      projectedCogs:         proj.cogs,
      projectedGrossProfit:  proj.grossProfitBeforeFees,
      projectedRealizedProfit: proj.realizedProfit,
      projectedRoi:          proj.roi,
    };
  });

  return NextResponse.json({
    sku,
    inventoryUnitCost: inventoryItem.unitCost,
    eligibleCount:     eligible.length,
    skippedCount:      skipped.length,
    totalRecords:      saleRecords.length,
    sampleRows,
    skippedReasons:    skipped.map((r) => ({ id: r.id, reason: r.skipReason })).slice(0, 10),
    warnings,
  });
}
