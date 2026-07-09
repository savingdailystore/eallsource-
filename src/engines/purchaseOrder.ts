// Purchase Order Engine — pure functions, no DB, no framework imports.
//
// DATA HONESTY RULES:
//  - Never fabricate quantity, cost, supplier, or date.
//  - Receiving caps at quantityOrdered; never exceeds it.
//  - PO status is always derived from item statuses — never set independently.
//  - unitCost and purchasedAt on InventoryItem are only set when the field is currently null.

// ─── Types ──────────────────────────────────────────────────────────────────

export type POStatus     = 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED' | 'CLOSED';
export type POItemStatus = 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';

export interface POItemSnapshot {
  quantityOrdered:  number;
  quantityReceived: number;
  status:           POItemStatus;
}

// ─── Item status ─────────────────────────────────────────────────────────────

/**
 * Derive the correct POItemStatus from quantities.
 * Never fabricates — only derives from what is actually received.
 */
export function deriveItemStatus(
  quantityOrdered:  number,
  quantityReceived: number,
): POItemStatus {
  if (quantityReceived <= 0)                             return 'ORDERED';
  if (quantityReceived >= quantityOrdered)               return 'RECEIVED';
  return 'PARTIALLY_RECEIVED';
}

// ─── PO status ───────────────────────────────────────────────────────────────

/**
 * Derive PurchaseOrder status from the current item snapshots.
 * DRAFT is not auto-derived — it is set explicitly on creation.
 * This function assumes the order has been placed (at least ORDERED).
 */
export function derivePOStatus(items: POItemSnapshot[]): POStatus {
  if (items.length === 0) return 'ORDERED';

  const nonCancelled = items.filter((i) => i.status !== 'CANCELLED');

  // All items cancelled → CANCELLED
  if (nonCancelled.length === 0) return 'CANCELLED';

  // All non-cancelled items fully received → RECEIVED
  const allReceived = nonCancelled.every((i) => i.status === 'RECEIVED');
  if (allReceived) return 'RECEIVED';

  // Any item partially or fully received → PARTIALLY_RECEIVED
  const anyReceived = nonCancelled.some(
    (i) => i.status === 'RECEIVED' || i.status === 'PARTIALLY_RECEIVED',
  );
  if (anyReceived) return 'PARTIALLY_RECEIVED';

  return 'ORDERED';
}

// ─── Receiving validation ────────────────────────────────────────────────────

export interface ReceiveValidationInput {
  quantityOrdered:  number;
  quantityReceived: number; // current received count before this action
  quantityToReceive: number; // new units being received in this action
}

export interface ReceiveValidationResult {
  valid:               boolean;
  error?:              string;
  newQuantityReceived: number; // resulting total after receive
  newStatus:           POItemStatus;
}

/**
 * Validate and compute the result of receiving units.
 * Prevents receiving more than ordered and rejects zero/negative inputs.
 */
export function validateReceive(input: ReceiveValidationInput): ReceiveValidationResult {
  const { quantityOrdered, quantityReceived, quantityToReceive } = input;

  if (!Number.isInteger(quantityToReceive) || quantityToReceive <= 0) {
    return {
      valid:               false,
      error:               'Quantity to receive must be a positive integer.',
      newQuantityReceived: quantityReceived,
      newStatus:           deriveItemStatus(quantityOrdered, quantityReceived),
    };
  }

  const newQty = quantityReceived + quantityToReceive;

  if (newQty > quantityOrdered) {
    return {
      valid: false,
      error: `Cannot receive ${quantityToReceive} unit${quantityToReceive !== 1 ? 's' : ''} — only ${quantityOrdered - quantityReceived} remaining to receive (${quantityOrdered} ordered, ${quantityReceived} already received).`,
      newQuantityReceived: quantityReceived,
      newStatus:           deriveItemStatus(quantityOrdered, quantityReceived),
    };
  }

  return {
    valid:               true,
    newQuantityReceived: newQty,
    newStatus:           deriveItemStatus(quantityOrdered, newQty),
  };
}

// ─── Inventory propagation rules ─────────────────────────────────────────────

export interface InventoryPropagationInput {
  // Receiving context
  receivedQty:    number;
  poUnitCost:     number;
  poOrderDate:    Date;

  // Existing InventoryItem state (null = item does not exist yet)
  existingUnitCost:   number | null;
  existingPurchasedAt: Date | null;
  existingSku:        string | null;

  // PO item context
  poSku: string | null;
}

export interface InventoryPropagationResult {
  // Quantity deltas to apply
  availableQuantityDelta: number;
  totalQuantityDelta:     number;

  // Fields to set only when currently null (non-overwrite rule)
  unitCostToSet:    number | null;  // null = preserve existing
  purchasedAtToSet: Date | null;    // null = preserve existing
  skuToSet:         string | null;  // null = preserve existing

  // Informational
  unitCostPreserved:    boolean; // existing unitCost was non-null and kept
  purchasedAtPreserved: boolean; // existing purchasedAt was non-null and kept
}

/**
 * Compute the exact changes to apply to an InventoryItem on receiving.
 * Enforces non-overwrite rule: existing unitCost and purchasedAt are preserved.
 */
export function computeInventoryPropagation(
  input: InventoryPropagationInput,
): InventoryPropagationResult {
  const {
    receivedQty, poUnitCost, poOrderDate,
    existingUnitCost, existingPurchasedAt, existingSku, poSku,
  } = input;

  return {
    availableQuantityDelta: receivedQty,
    totalQuantityDelta:     receivedQty,

    // Only set when the existing field is null
    unitCostToSet:    existingUnitCost    == null ? poUnitCost   : null,
    purchasedAtToSet: existingPurchasedAt == null ? poOrderDate  : null,
    skuToSet:         existingSku         == null && poSku != null ? poSku : null,

    unitCostPreserved:    existingUnitCost    != null,
    purchasedAtPreserved: existingPurchasedAt != null,
  };
}

// ─── Repricing cost-basis propagation rules ──────────────────────────────────

export interface RepricingPropagationInput {
  existingCostBasis: number | null;
  poUnitCost:        number;
}

export interface RepricingPropagationResult {
  costBasisToSet:    number | null; // null = preserve existing
  costBasisPreserved: boolean;
}

/**
 * Compute whether to set RepricingRule.costBasis from a received PO item.
 * Only sets when the existing costBasis is null (non-overwrite rule).
 * A manually-set costBasis (including zero) is always preserved.
 */
export function computeRepricingPropagation(
  input: RepricingPropagationInput,
): RepricingPropagationResult {
  const { existingCostBasis, poUnitCost } = input;
  return {
    costBasisToSet:    existingCostBasis == null ? poUnitCost : null,
    costBasisPreserved: existingCostBasis != null,
  };
}

// ─── PO total cost calculation ───────────────────────────────────────────────

export interface POCostSummary {
  itemsSubtotal: number;
  shippingCost:  number;
  tax:           number;
  totalCost:     number;
}

export function computePOCost(
  items:        { quantityOrdered: number; unitCost: number; status: POItemStatus }[],
  shippingCost: number,
  tax:          number,
): POCostSummary {
  const itemsSubtotal = items
    .filter((i) => i.status !== 'CANCELLED')
    .reduce((sum, i) => sum + i.quantityOrdered * i.unitCost, 0);

  return {
    itemsSubtotal,
    shippingCost,
    tax,
    totalCost: itemsSubtotal + shippingCost + tax,
  };
}

// ─── Dashboard summary ───────────────────────────────────────────────────────

export interface PODashboardSummary {
  totalOrders:          number;
  openOrders:           number;     // ORDERED + PARTIALLY_RECEIVED
  partiallyReceived:    number;
  fullyReceived:        number;
  draftOrders:          number;
  totalOrderedCost:     number;     // sum of non-cancelled order totalCost
  totalPendingUnits:    number;     // sum of (quantityOrdered - quantityReceived) for non-cancelled items
}

export interface POSummaryInput {
  status:    POStatus;
  totalCost: number;
  items:     { quantityOrdered: number; quantityReceived: number; status: POItemStatus }[];
}

export function buildPODashboardSummary(orders: POSummaryInput[]): PODashboardSummary {
  let totalOrders       = 0;
  let openOrders        = 0;
  let partiallyReceived = 0;
  let fullyReceived     = 0;
  let draftOrders       = 0;
  let totalOrderedCost  = 0;
  let totalPendingUnits = 0;

  for (const po of orders) {
    totalOrders++;
    if (po.status === 'DRAFT')               draftOrders++;
    if (po.status === 'ORDERED')             openOrders++;
    if (po.status === 'PARTIALLY_RECEIVED')  { openOrders++; partiallyReceived++; }
    if (po.status === 'RECEIVED')            fullyReceived++;
    if (po.status !== 'CANCELLED')           totalOrderedCost += po.totalCost;

    for (const item of po.items) {
      if (item.status !== 'CANCELLED') {
        totalPendingUnits += Math.max(0, item.quantityOrdered - item.quantityReceived);
      }
    }
  }

  return {
    totalOrders,
    openOrders,
    partiallyReceived,
    fullyReceived,
    draftOrders,
    totalOrderedCost,
    totalPendingUnits,
  };
}
