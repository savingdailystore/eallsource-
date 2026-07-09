import { NextResponse }                       from 'next/server';
import { auth }                              from '@/lib/auth';
import { prisma }                            from '@/lib/prisma';
import {
  isEligibleForCostRecalculation,
  applyInventoryCostToSaleRecord,
} from '@/engines/salesTracking';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { role, orgId } = session.user;
  if (role !== 'OWNER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden — only owners and admins can apply cost recalculation' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const raw      = body as Record<string, unknown>;
  const sku      = typeof raw.sku === 'string' ? raw.sku.trim() : null;
  const confirmed = raw.confirmed === true;

  if (!sku) {
    return NextResponse.json({ error: 'sku is required' }, { status: 400 });
  }

  if (!confirmed) {
    return NextResponse.json({ error: 'confirmed must be true to apply recalculation' }, { status: 400 });
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

  const unitCost = inventoryItem.unitCost;

  // Fetch all sale records for this org + SKU where cost is missing
  const saleRecords = await prisma.saleRecord.findMany({
    where:  { orgId, sku, unitCostUsed: null },
    select: {
      id:           true,
      sku:          true,
      asin:         true,
      quantitySold: true,
      netRevenue:   true,
      totalFees:    true,
      unitCostUsed: true,
      orderStatus:  true,
    },
  });

  let updatedCount = 0;
  let skippedCount = 0;

  for (const record of saleRecords) {
    const { eligible } = isEligibleForCostRecalculation(record);
    if (!eligible) { skippedCount++; continue; }

    const computed = applyInventoryCostToSaleRecord(record, unitCost);

    await prisma.saleRecord.update({
      where: { id: record.id },
      data:  {
        unitCostUsed:          computed.unitCostUsed,
        costSource:            computed.costSource,
        cogs:                  computed.cogs,
        grossProfitBeforeFees: computed.grossProfitBeforeFees,
        grossRoiBeforeFees:    computed.grossRoiBeforeFees,
        realizedProfit:        computed.realizedProfit,
        roi:                   computed.roi,
      },
    });

    updatedCount++;
  }

  return NextResponse.json({
    sku,
    inventoryUnitCost: unitCost,
    updatedCount,
    skippedCount,
  });
}
