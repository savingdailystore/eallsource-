import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import {
  validateReceive,
  computeInventoryPropagation,
  computeRepricingPropagation,
  derivePOStatus,
} from '@/engines/purchaseOrder';

export const dynamic = 'force-dynamic';

const receiveItemSchema = z.object({
  itemId:           z.string().min(1),
  quantityToReceive: z.number().int().positive(),
  notes:            z.string().max(1000).optional(),
});

const receiveSchema = z.object({
  items: z.array(receiveItemSchema).min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { role, orgId } = session.user;
  if (role === 'VIEWER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const po = await prisma.purchaseOrder.findFirst({
    where:   { id, orgId },
    include: { items: true },
  });
  if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (po.status === 'CANCELLED') {
    return NextResponse.json({ error: 'Cannot receive items on a cancelled order' }, { status: 422 });
  }
  if (po.status === 'RECEIVED') {
    return NextResponse.json({ error: 'Order is already fully received' }, { status: 422 });
  }
  if (po.status === 'CLOSED') {
    return NextResponse.json({ error: 'Cannot receive items on a closed order' }, { status: 422 });
  }

  const body = await req.json();
  const parsed = receiveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { items: receiveRequests } = parsed.data;

  // Validate all items before making any DB changes
  const validationErrors: { itemId: string; error: string }[] = [];
  const updates: {
    item:                (typeof po.items)[number];
    newQuantityReceived: number;
    newStatus:           string;
    quantityToReceive:   number;
    notes?:              string;
  }[] = [];

  for (const req of receiveRequests) {
    const item = po.items.find((i) => i.id === req.itemId);
    if (!item) {
      validationErrors.push({ itemId: req.itemId, error: 'Item not found on this order' });
      continue;
    }
    if (item.status === 'CANCELLED') {
      validationErrors.push({ itemId: req.itemId, error: 'Cannot receive a cancelled item' });
      continue;
    }
    if (item.status === 'RECEIVED') {
      validationErrors.push({ itemId: req.itemId, error: 'Item is already fully received' });
      continue;
    }

    const validation = validateReceive({
      quantityOrdered:   item.quantityOrdered,
      quantityReceived:  item.quantityReceived,
      quantityToReceive: req.quantityToReceive,
    });

    if (!validation.valid) {
      validationErrors.push({ itemId: req.itemId, error: validation.error! });
      continue;
    }

    updates.push({
      item,
      newQuantityReceived: validation.newQuantityReceived,
      newStatus:           validation.newStatus,
      quantityToReceive:   req.quantityToReceive,
      notes:               req.notes,
    });
  }

  if (validationErrors.length > 0) {
    return NextResponse.json({ error: 'Validation failed', details: validationErrors }, { status: 422 });
  }

  const receivedAt = new Date();

  // Mutable summary — updated inside the transaction
  const summary = {
    totalReceived:    0,
    inventoryUpdated: false,
    unitCostSet:      false,
    purchasedAtSet:   false,
    costBasisSet:     false,
  };

  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      const { item, newQuantityReceived, newStatus, notes } = update;

      summary.totalReceived += update.quantityToReceive;

      // Update the PO item
      await tx.purchaseOrderItem.update({
        where: { id: item.id },
        data: {
          quantityReceived: newQuantityReceived,
          status:           newStatus as never,
          receivedAt:       newStatus === 'RECEIVED' ? receivedAt : item.receivedAt,
          ...(notes ? { notes } : {}),
        },
      });

      // Upsert InventoryItem + sync RepricingRule.costBasis if ASIN is known
      if (item.asin) {
        const existing = await tx.inventoryItem.findUnique({
          where: { orgId_asin: { orgId, asin: item.asin } },
          select: { unitCost: true, purchasedAt: true, sku: true },
        });

        const prop = computeInventoryPropagation({
          receivedQty:         update.quantityToReceive,
          poUnitCost:          item.unitCost,
          poOrderDate:         po.orderDate,
          existingUnitCost:    existing?.unitCost    ?? null,
          existingPurchasedAt: existing?.purchasedAt ?? null,
          existingSku:         existing?.sku         ?? null,
          poSku:               item.sku,
        });

        if (existing) {
          await tx.inventoryItem.update({
            where: { orgId_asin: { orgId, asin: item.asin } },
            data: {
              availableQuantity: { increment: prop.availableQuantityDelta },
              totalQuantity:     { increment: prop.totalQuantityDelta },
              ...(prop.unitCostToSet    != null ? { unitCost:    prop.unitCostToSet }    : {}),
              ...(prop.purchasedAtToSet != null ? { purchasedAt: prop.purchasedAtToSet } : {}),
              ...(prop.skuToSet         != null ? { sku:         prop.skuToSet }         : {}),
            },
          });
        } else {
          // Create new inventory record
          await tx.inventoryItem.create({
            data: {
              orgId,
              asin:              item.asin,
              sku:               prop.skuToSet    ?? item.sku    ?? undefined,
              productName:       item.productName,
              availableQuantity: prop.availableQuantityDelta,
              totalQuantity:     prop.totalQuantityDelta,
              reservedQuantity:  0,
              inboundQuantity:   0,
              unitCost:          prop.unitCostToSet    ?? undefined,
              purchasedAt:       prop.purchasedAtToSet ?? undefined,
            },
          });
        }

        summary.inventoryUpdated = true;
        if (prop.unitCostToSet    != null) summary.unitCostSet    = true;
        if (prop.purchasedAtToSet != null) summary.purchasedAtSet = true;

        // Sync RepricingRule.costBasis (non-overwrite rule: only set when null)
        const repricingRule = await tx.repricingRule.findFirst({
          where:  { orgId, asin: item.asin },
          select: { id: true, costBasis: true },
        });
        if (repricingRule) {
          const rp = computeRepricingPropagation({
            existingCostBasis: repricingRule.costBasis,
            poUnitCost:        item.unitCost,
          });
          if (rp.costBasisToSet != null) {
            await tx.repricingRule.update({
              where: { id: repricingRule.id },
              data:  { costBasis: rp.costBasisToSet },
            });
            summary.costBasisSet = true;
          }
        }
      }
    }

    // Derive and update PO status from all items
    const allItems = await tx.purchaseOrderItem.findMany({
      where: { purchaseOrderId: po.id },
      select: { quantityOrdered: true, quantityReceived: true, status: true },
    });

    const newPoStatus = derivePOStatus(
      allItems.map((i) => ({
        quantityOrdered:  i.quantityOrdered,
        quantityReceived: i.quantityReceived,
        status:           i.status as never,
      })),
    );

    await tx.purchaseOrder.update({
      where: { id: po.id },
      data:  { status: newPoStatus as never },
    });
  });

  const updatedPO = await prisma.purchaseOrder.findFirst({
    where:   { id: po.id },
    include: { items: { orderBy: { createdAt: 'asc' } } },
  });

  return NextResponse.json({ order: updatedPO, summary });
}
