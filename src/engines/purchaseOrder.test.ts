import { describe, it, expect } from 'vitest';
import {
  deriveItemStatus,
  derivePOStatus,
  validateReceive,
  computeInventoryPropagation,
  computeRepricingPropagation,
  computePOCost,
  buildPODashboardSummary,
  type POItemSnapshot,
} from './purchaseOrder';

// ─── 1. Item status ──────────────────────────────────────────────────────────

describe('deriveItemStatus', () => {
  it('ORDERED when nothing received', () => {
    expect(deriveItemStatus(10, 0)).toBe('ORDERED');
  });

  it('PARTIALLY_RECEIVED when some but not all received', () => {
    expect(deriveItemStatus(10, 5)).toBe('PARTIALLY_RECEIVED');
    expect(deriveItemStatus(10, 1)).toBe('PARTIALLY_RECEIVED');
    expect(deriveItemStatus(10, 9)).toBe('PARTIALLY_RECEIVED');
  });

  it('RECEIVED when all received', () => {
    expect(deriveItemStatus(10, 10)).toBe('RECEIVED');
    expect(deriveItemStatus(1, 1)).toBe('RECEIVED');
  });

  it('RECEIVED when quantityReceived exceeds ordered (safety)', () => {
    // Engine should treat ≥ ordered as RECEIVED
    expect(deriveItemStatus(5, 6)).toBe('RECEIVED');
  });

  it('ORDERED when quantityReceived is 0 and ordered is 1', () => {
    expect(deriveItemStatus(1, 0)).toBe('ORDERED');
  });
});

// ─── 2. PO status ────────────────────────────────────────────────────────────

function snap(
  quantityOrdered: number,
  quantityReceived: number,
  status: POItemSnapshot['status'],
): POItemSnapshot {
  return { quantityOrdered, quantityReceived, status };
}

describe('derivePOStatus', () => {
  it('ORDERED when no items are received', () => {
    expect(derivePOStatus([snap(5, 0, 'ORDERED'), snap(3, 0, 'ORDERED')])).toBe('ORDERED');
  });

  it('PARTIALLY_RECEIVED when one item is partially received', () => {
    expect(derivePOStatus([snap(5, 2, 'PARTIALLY_RECEIVED'), snap(3, 0, 'ORDERED')])).toBe('PARTIALLY_RECEIVED');
  });

  it('PARTIALLY_RECEIVED when one item fully received but another still pending', () => {
    expect(derivePOStatus([snap(5, 5, 'RECEIVED'), snap(3, 0, 'ORDERED')])).toBe('PARTIALLY_RECEIVED');
  });

  it('RECEIVED when all items fully received', () => {
    expect(derivePOStatus([snap(5, 5, 'RECEIVED'), snap(3, 3, 'RECEIVED')])).toBe('RECEIVED');
  });

  it('CANCELLED when all items are cancelled', () => {
    expect(derivePOStatus([snap(5, 0, 'CANCELLED'), snap(3, 0, 'CANCELLED')])).toBe('CANCELLED');
  });

  it('RECEIVED when remaining items are cancelled and one is received', () => {
    expect(derivePOStatus([snap(5, 5, 'RECEIVED'), snap(3, 0, 'CANCELLED')])).toBe('RECEIVED');
  });

  it('ORDERED for empty items list', () => {
    expect(derivePOStatus([])).toBe('ORDERED');
  });

  it('PARTIALLY_RECEIVED when mix of received + cancelled + ordered', () => {
    expect(derivePOStatus([
      snap(5, 5, 'RECEIVED'),
      snap(3, 0, 'CANCELLED'),
      snap(2, 0, 'ORDERED'),
    ])).toBe('PARTIALLY_RECEIVED');
  });
});

// ─── 3. Receiving validation ─────────────────────────────────────────────────

describe('validateReceive', () => {
  it('valid full receive', () => {
    const result = validateReceive({ quantityOrdered: 10, quantityReceived: 0, quantityToReceive: 10 });
    expect(result.valid).toBe(true);
    expect(result.newQuantityReceived).toBe(10);
    expect(result.newStatus).toBe('RECEIVED');
  });

  it('valid partial receive', () => {
    const result = validateReceive({ quantityOrdered: 10, quantityReceived: 0, quantityToReceive: 4 });
    expect(result.valid).toBe(true);
    expect(result.newQuantityReceived).toBe(4);
    expect(result.newStatus).toBe('PARTIALLY_RECEIVED');
  });

  it('valid second partial receive completing the order', () => {
    const result = validateReceive({ quantityOrdered: 10, quantityReceived: 7, quantityToReceive: 3 });
    expect(result.valid).toBe(true);
    expect(result.newQuantityReceived).toBe(10);
    expect(result.newStatus).toBe('RECEIVED');
  });

  it('prevents receiving more than ordered', () => {
    const result = validateReceive({ quantityOrdered: 5, quantityReceived: 0, quantityToReceive: 6 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cannot receive');
    expect(result.newQuantityReceived).toBe(0); // unchanged
  });

  it('prevents over-receiving on partial order', () => {
    const result = validateReceive({ quantityOrdered: 10, quantityReceived: 8, quantityToReceive: 5 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('2 remaining');
  });

  it('rejects zero quantity', () => {
    const result = validateReceive({ quantityOrdered: 10, quantityReceived: 0, quantityToReceive: 0 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('positive integer');
  });

  it('rejects negative quantity', () => {
    const result = validateReceive({ quantityOrdered: 10, quantityReceived: 0, quantityToReceive: -1 });
    expect(result.valid).toBe(false);
  });

  it('rejects non-integer quantity', () => {
    const result = validateReceive({ quantityOrdered: 10, quantityReceived: 0, quantityToReceive: 2.5 });
    expect(result.valid).toBe(false);
  });

  it('allows receiving exactly what remains', () => {
    const result = validateReceive({ quantityOrdered: 10, quantityReceived: 7, quantityToReceive: 3 });
    expect(result.valid).toBe(true);
    expect(result.newQuantityReceived).toBe(10);
  });
});

// ─── 4. Inventory propagation ────────────────────────────────────────────────

describe('computeInventoryPropagation', () => {
  const baseInput = {
    receivedQty:         5,
    poUnitCost:          18.50,
    poOrderDate:         new Date('2024-06-01'),
    existingUnitCost:    null,
    existingPurchasedAt: null,
    existingSku:         null,
    poSku:               'MY-SKU-001',
  };

  it('sets unitCost from PO when inventory unitCost is null', () => {
    const result = computeInventoryPropagation(baseInput);
    expect(result.unitCostToSet).toBe(18.50);
    expect(result.unitCostPreserved).toBe(false);
  });

  it('preserves existing unitCost when non-null', () => {
    const result = computeInventoryPropagation({ ...baseInput, existingUnitCost: 20.00 });
    expect(result.unitCostToSet).toBeNull();
    expect(result.unitCostPreserved).toBe(true);
  });

  it('sets purchasedAt from PO orderDate when null', () => {
    const result = computeInventoryPropagation(baseInput);
    expect(result.purchasedAtToSet).toEqual(new Date('2024-06-01'));
    expect(result.purchasedAtPreserved).toBe(false);
  });

  it('preserves existing purchasedAt when non-null', () => {
    const result = computeInventoryPropagation({ ...baseInput, existingPurchasedAt: new Date('2024-01-01') });
    expect(result.purchasedAtToSet).toBeNull();
    expect(result.purchasedAtPreserved).toBe(true);
  });

  it('sets SKU from PO when inventory SKU is null', () => {
    const result = computeInventoryPropagation(baseInput);
    expect(result.skuToSet).toBe('MY-SKU-001');
  });

  it('preserves existing SKU when non-null', () => {
    const result = computeInventoryPropagation({ ...baseInput, existingSku: 'EXISTING-SKU' });
    expect(result.skuToSet).toBeNull();
  });

  it('does not set SKU when PO has no SKU', () => {
    const result = computeInventoryPropagation({ ...baseInput, poSku: null });
    expect(result.skuToSet).toBeNull();
  });

  it('always increments availableQuantity and totalQuantity by received qty', () => {
    const result = computeInventoryPropagation(baseInput);
    expect(result.availableQuantityDelta).toBe(5);
    expect(result.totalQuantityDelta).toBe(5);
  });

  it('does not fabricate unitCost when PO cost exists but inventory cost also exists', () => {
    const result = computeInventoryPropagation({ ...baseInput, existingUnitCost: 15.00 });
    expect(result.unitCostToSet).toBeNull(); // not overwriting
    expect(result.unitCostPreserved).toBe(true);
  });
});

// ─── 5. Repricing propagation ────────────────────────────────────────────────

describe('computeRepricingPropagation', () => {
  it('sets costBasis when existingCostBasis is null', () => {
    const result = computeRepricingPropagation({ existingCostBasis: null, poUnitCost: 12.50 });
    expect(result.costBasisToSet).toBe(12.50);
    expect(result.costBasisPreserved).toBe(false);
  });

  it('preserves costBasis when existingCostBasis is non-null', () => {
    const result = computeRepricingPropagation({ existingCostBasis: 10.00, poUnitCost: 12.50 });
    expect(result.costBasisToSet).toBeNull();
    expect(result.costBasisPreserved).toBe(true);
  });

  it('preserves costBasis of zero (zero is a valid manual entry, not null)', () => {
    const result = computeRepricingPropagation({ existingCostBasis: 0, poUnitCost: 12.50 });
    expect(result.costBasisToSet).toBeNull();
    expect(result.costBasisPreserved).toBe(true);
  });

  it('preserves existing costBasis even when PO cost is lower', () => {
    const result = computeRepricingPropagation({ existingCostBasis: 15.00, poUnitCost: 5.00 });
    expect(result.costBasisToSet).toBeNull();
    expect(result.costBasisPreserved).toBe(true);
  });
});

// ─── 7. PO cost calculation ──────────────────────────────────────────────────

describe('computePOCost', () => {
  it('sums item costs plus shipping and tax', () => {
    const items = [
      { quantityOrdered: 2, unitCost: 10, status: 'ORDERED'  as const },
      { quantityOrdered: 3, unitCost: 5,  status: 'ORDERED'  as const },
    ];
    const result = computePOCost(items, 5.00, 2.50);
    expect(result.itemsSubtotal).toBe(35.00); // 2×10 + 3×5
    expect(result.shippingCost).toBe(5.00);
    expect(result.tax).toBe(2.50);
    expect(result.totalCost).toBe(42.50);
  });

  it('excludes cancelled items from subtotal', () => {
    const items = [
      { quantityOrdered: 2, unitCost: 10, status: 'ORDERED'    as const },
      { quantityOrdered: 3, unitCost: 5,  status: 'CANCELLED'  as const },
    ];
    const result = computePOCost(items, 0, 0);
    expect(result.itemsSubtotal).toBe(20.00); // only the ORDERED item
  });

  it('returns 0 total for empty items with no shipping/tax', () => {
    const result = computePOCost([], 0, 0);
    expect(result.totalCost).toBe(0);
  });
});

// ─── 8. Dashboard summary ────────────────────────────────────────────────────

describe('buildPODashboardSummary', () => {
  it('counts order statuses correctly', () => {
    const orders = [
      { status: 'ORDERED'            as const, totalCost: 100, items: [{ quantityOrdered: 5, quantityReceived: 0, status: 'ORDERED' as const }] },
      { status: 'PARTIALLY_RECEIVED' as const, totalCost: 200, items: [{ quantityOrdered: 5, quantityReceived: 2, status: 'PARTIALLY_RECEIVED' as const }] },
      { status: 'RECEIVED'           as const, totalCost: 300, items: [{ quantityOrdered: 3, quantityReceived: 3, status: 'RECEIVED' as const }] },
      { status: 'CANCELLED'          as const, totalCost: 50,  items: [{ quantityOrdered: 2, quantityReceived: 0, status: 'CANCELLED' as const }] },
    ];
    const summary = buildPODashboardSummary(orders);
    expect(summary.totalOrders).toBe(4);
    expect(summary.openOrders).toBe(2);        // ORDERED + PARTIALLY_RECEIVED
    expect(summary.partiallyReceived).toBe(1);
    expect(summary.fullyReceived).toBe(1);
    expect(summary.totalOrderedCost).toBe(600);  // excludes CANCELLED $50
    expect(summary.totalPendingUnits).toBe(8);   // 5 + (5-2) + (3-3) + cancelled excluded = 5+3 = 8
  });

  it('returns zero summary for empty orders', () => {
    const summary = buildPODashboardSummary([]);
    expect(summary.totalOrders).toBe(0);
    expect(summary.totalOrderedCost).toBe(0);
    expect(summary.totalPendingUnits).toBe(0);
  });

  it('counts draft orders separately', () => {
    const orders = [
      { status: 'DRAFT' as const, totalCost: 100, items: [] },
    ];
    const summary = buildPODashboardSummary(orders);
    expect(summary.draftOrders).toBe(1);
    expect(summary.openOrders).toBe(0);
    expect(summary.totalOrderedCost).toBe(100);
  });
});
