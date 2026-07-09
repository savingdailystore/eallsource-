// Business Intelligence Engine — pure functions, no DB, no framework imports.
//
// DATA HONESTY RULES (enforced here):
//  - Never fabricate revenue, sales, realized profit, sales velocity, or conversion rates.
//  - Never estimate inventory value when unit cost is unknown.
//  - Never claim Amazon owes money with certainty.
//  - Every ActionItem must correspond to a non-zero count from a real query.
//  - hasData flags must be false when the underlying array is empty.

import { evaluateInventoryHealth, type InventoryProductSnapshot, type InventoryRepricingSnapshot } from './inventoryHealth';
import { buildRecoverySummary, type ReimbursementRecoveryAnalysis } from './reimbursementRecovery';

// ─── Input shapes (caller fetches from DB) ───────────────────────────────────

export interface LeadForBI {
  status:    string;
  createdAt: Date;
}

export interface InventoryItemForBI {
  availableQuantity: number;
  reservedQuantity:  number;
  inboundQuantity:   number;
  totalQuantity:     number;
  createdAt:         Date;
  purchasedAt?:      Date | null;
  unitCost?:         number | null;
  product?:          InventoryProductSnapshot | null;
  repricing?:        InventoryRepricingSnapshot | null;
}

export interface POForBI {
  status:    string;
  totalCost: number;
  items: {
    quantityOrdered:  number;
    quantityReceived: number;
    status:           string;
  }[];
}

export interface RepricingRuleForBI {
  isActive:       boolean;
  costBasis?:     number | null;
  lastRepricedAt?: Date | null;
}

export interface RepricingHistoryForBI {
  status:    string;
  pushedAt?: Date | null;
}

export interface SyncForBI {
  status:      string;
  startedAt:   Date;
  completedAt?: Date | null;
  source:      string;
  recordsFound?:    number | null;
  recordsUpserted?: number | null;
}

// ─── Output shapes ───────────────────────────────────────────────────────────

export interface LeadSummary {
  total:     number;
  newCount:  number;
  saved:     number;
  purchased: number;
  rejected:  number;
  newToday:  number;
  hasData:   boolean;
}

export interface WorkflowFunnelSummary {
  totalLeads:     number;
  savedLeads:     number;
  purchasedLeads: number;
  openPOs:        number;     // ORDERED + PARTIALLY_RECEIVED
  partialPOs:     number;     // PARTIALLY_RECEIVED only
  receivedPOs:    number;
  inventoryItems: number;
  pendingUnits:   number;     // sum of (ordered - received) for open PO items
  hasData:        boolean;
}

export interface InventorySummary {
  totalItems:          number;
  totalUnits:          number;
  availableUnits:      number;
  healthCounts: {
    HEALTHY:      number;
    REORDER_SOON: number;
    AGING:        number;
    LOW_MARGIN:   number;
    AT_RISK:      number;
    OVERSTOCKED:  number;
    UNKNOWN:      number;
  };
  knownInventoryValue: number;   // availableQty × unitCost, summed; 0 when no cost data
  itemsWithKnownCost:  number;
  itemsMissingCost:    number;
  itemsMissingProduct: number;   // no Product linked
  hasData:             boolean;
}

export interface POSummary {
  total:             number;
  draft:             number;
  ordered:           number;
  partiallyReceived: number;
  received:          number;
  cancelled:         number;
  closed:            number;
  openCost:          number;   // totalCost for ORDERED + PARTIALLY_RECEIVED
  pendingUnits:      number;   // sum of un-received units
  hasData:           boolean;
}

export interface RepricingSummary {
  totalRules:       number;
  activeRules:      number;
  pausedRules:      number;
  rulesMissingCost: number;
  staleActiveRules: number;   // active rules with no run in the last 14 days
  pendingProposals: number;
  failedPushes:     number;
  recentPushCount:  number;   // PUSHED in the last 7 days
  hasData:          boolean;
}

export interface RecoveryBISummary {
  totalEntries:             number;
  totalReimbursed:          number;
  possibleUnderpaymentCount: number;
  totalPossibleShortfall:   number;
  missingCostCount:         number;
  reviewCount:              number;
  lastSyncAt?:              Date | null;
  lastSyncStatus?:          string | null;
  lastSyncSource?:          string | null;
  hasData:                  boolean;
}

export type ActionPriority = 'high' | 'medium' | 'low';

export interface ActionItem {
  priority:    ActionPriority;
  label:       string;
  count:       number;
  href:        string;
  description: string;
}

// ─── 1. Lead summary ─────────────────────────────────────────────────────────

export function summarizeLeads(leads: LeadForBI[]): LeadSummary {
  if (leads.length === 0) {
    return { total: 0, newCount: 0, saved: 0, purchased: 0, rejected: 0, newToday: 0, hasData: false };
  }

  const now          = new Date();
  const oneDayAgo    = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  let newCount  = 0;
  let saved     = 0;
  let purchased = 0;
  let rejected  = 0;
  let newToday  = 0;

  for (const l of leads) {
    if (l.status === 'NEW')       newCount++;
    if (l.status === 'SAVED')     saved++;
    if (l.status === 'PURCHASED') purchased++;
    if (l.status === 'REJECTED')  rejected++;
    if (l.createdAt >= oneDayAgo) newToday++;
  }

  return { total: leads.length, newCount, saved, purchased, rejected, newToday, hasData: true };
}

// ─── 2. Workflow funnel ───────────────────────────────────────────────────────

export function summarizeWorkflowFunnel(
  leads:     LeadForBI[],
  pos:       POForBI[],
  invCount:  number,
): WorkflowFunnelSummary {
  const totalLeads     = leads.length;
  const savedLeads     = leads.filter((l) => l.status === 'SAVED').length;
  const purchasedLeads = leads.filter((l) => l.status === 'PURCHASED').length;

  const openPOs     = pos.filter((p) => p.status === 'ORDERED' || p.status === 'PARTIALLY_RECEIVED').length;
  const partialPOs  = pos.filter((p) => p.status === 'PARTIALLY_RECEIVED').length;
  const receivedPOs = pos.filter((p) => p.status === 'RECEIVED').length;

  let pendingUnits = 0;
  for (const po of pos) {
    if (po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED') {
      for (const item of po.items) {
        if (item.status !== 'RECEIVED' && item.status !== 'CANCELLED') {
          pendingUnits += Math.max(0, item.quantityOrdered - item.quantityReceived);
        }
      }
    }
  }

  const hasData = totalLeads > 0 || pos.length > 0 || invCount > 0;

  return { totalLeads, savedLeads, purchasedLeads, openPOs, partialPOs, receivedPOs, inventoryItems: invCount, pendingUnits, hasData };
}

// ─── 3. Inventory summary ─────────────────────────────────────────────────────

export function summarizeInventory(items: InventoryItemForBI[]): InventorySummary {
  const empty: InventorySummary = {
    totalItems: 0, totalUnits: 0, availableUnits: 0,
    healthCounts: { HEALTHY: 0, REORDER_SOON: 0, AGING: 0, LOW_MARGIN: 0, AT_RISK: 0, OVERSTOCKED: 0, UNKNOWN: 0 },
    knownInventoryValue: 0, itemsWithKnownCost: 0, itemsMissingCost: 0, itemsMissingProduct: 0,
    hasData: false,
  };

  if (items.length === 0) return empty;

  const healthCounts = { HEALTHY: 0, REORDER_SOON: 0, AGING: 0, LOW_MARGIN: 0, AT_RISK: 0, OVERSTOCKED: 0, UNKNOWN: 0 };
  let totalUnits          = 0;
  let availableUnits      = 0;
  let knownInventoryValue = 0;
  let itemsWithKnownCost  = 0;
  let itemsMissingCost    = 0;
  let itemsMissingProduct = 0;

  for (const item of items) {
    totalUnits     += item.totalQuantity;
    availableUnits += item.availableQuantity;

    if (!item.product) itemsMissingProduct++;

    const health = evaluateInventoryHealth({
      availableQuantity: item.availableQuantity,
      reservedQuantity:  item.reservedQuantity,
      inboundQuantity:   item.inboundQuantity,
      totalQuantity:     item.totalQuantity,
      createdAt:         item.createdAt,
      purchasedAt:       item.purchasedAt,
      unitCost:          item.unitCost,
      product:           item.product ?? undefined,
      repricing:         item.repricing ?? undefined,
    });

    healthCounts[health.status]++;

    if (health.costSummary) {
      knownInventoryValue += health.costSummary.inventoryValue;
      itemsWithKnownCost++;
    } else {
      itemsMissingCost++;
    }
  }

  return {
    totalItems: items.length,
    totalUnits,
    availableUnits,
    healthCounts,
    knownInventoryValue,
    itemsWithKnownCost,
    itemsMissingCost,
    itemsMissingProduct,
    hasData: true,
  };
}

// ─── 4. Purchase order summary ────────────────────────────────────────────────

export function summarizePurchaseOrders(pos: POForBI[]): POSummary {
  if (pos.length === 0) {
    return { total: 0, draft: 0, ordered: 0, partiallyReceived: 0, received: 0, cancelled: 0, closed: 0, openCost: 0, pendingUnits: 0, hasData: false };
  }

  let draft = 0, ordered = 0, partiallyReceived = 0, received = 0, cancelled = 0, closed = 0;
  let openCost     = 0;
  let pendingUnits = 0;

  for (const po of pos) {
    if (po.status === 'DRAFT')              draft++;
    if (po.status === 'ORDERED')            ordered++;
    if (po.status === 'PARTIALLY_RECEIVED') partiallyReceived++;
    if (po.status === 'RECEIVED')           received++;
    if (po.status === 'CANCELLED')          cancelled++;
    if (po.status === 'CLOSED')             closed++;

    // CLOSED is terminal — excluded from open cost and pending units
    if (po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED') {
      openCost += po.totalCost;
      for (const item of po.items) {
        if (item.status !== 'RECEIVED' && item.status !== 'CANCELLED') {
          pendingUnits += Math.max(0, item.quantityOrdered - item.quantityReceived);
        }
      }
    }
  }

  return { total: pos.length, draft, ordered, partiallyReceived, received, cancelled, closed, openCost, pendingUnits, hasData: true };
}

// ─── 5. Repricing summary ─────────────────────────────────────────────────────

export function summarizeRepricing(
  rules:   RepricingRuleForBI[],
  history: RepricingHistoryForBI[],
): RepricingSummary {
  if (rules.length === 0 && history.length === 0) {
    return { totalRules: 0, activeRules: 0, pausedRules: 0, rulesMissingCost: 0, staleActiveRules: 0, pendingProposals: 0, failedPushes: 0, recentPushCount: 0, hasData: false };
  }

  const activeRules      = rules.filter((r) => r.isActive).length;
  const pausedRules      = rules.filter((r) => !r.isActive).length;
  const rulesMissingCost = rules.filter((r) => r.costBasis == null).length;

  const fourteenDaysAgo  = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const staleActiveRules = rules.filter(
    (r) => r.isActive && (r.lastRepricedAt == null || r.lastRepricedAt < fourteenDaysAgo),
  ).length;

  const pendingProposals = history.filter((h) => h.status === 'PROPOSED').length;
  const failedPushes     = history.filter((h) => h.status === 'FAILED').length;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentPushCount = history.filter(
    (h) => h.status === 'PUSHED' && h.pushedAt != null && h.pushedAt >= sevenDaysAgo,
  ).length;

  return {
    totalRules: rules.length,
    activeRules,
    pausedRules,
    rulesMissingCost,
    staleActiveRules,
    pendingProposals,
    failedPushes,
    recentPushCount,
    hasData: true,
  };
}

// ─── 6. Recovery summary ──────────────────────────────────────────────────────

export function summarizeRecovery(
  analyses: ReimbursementRecoveryAnalysis[],
  lastSync?: SyncForBI | null,
): RecoveryBISummary {
  if (analyses.length === 0 && !lastSync) {
    return {
      totalEntries: 0, totalReimbursed: 0, possibleUnderpaymentCount: 0,
      totalPossibleShortfall: 0, missingCostCount: 0, reviewCount: 0,
      lastSyncAt: null, lastSyncStatus: null, lastSyncSource: null, hasData: false,
    };
  }

  const core = buildRecoverySummary(analyses);

  return {
    totalEntries:              core.totalRecords,
    totalReimbursed:           core.totalReimbursed,
    possibleUnderpaymentCount: core.possibleUnderpaymentCount,
    totalPossibleShortfall:    core.totalPossibleShortfall,
    missingCostCount:          core.missingCostCount,
    reviewCount:               core.reviewCount,
    lastSyncAt:     lastSync?.startedAt ?? null,
    lastSyncStatus: lastSync?.status    ?? null,
    lastSyncSource: lastSync?.source    ?? null,
    hasData:        true,
  };
}

// ─── 7. Action center ─────────────────────────────────────────────────────────

export interface ActionInputs {
  pendingProposals:          number;
  failedPushes:              number;
  pendingPOUnits:            number;  // units across all open PO items
  openPOCount:               number;
  totalPOs:                  number;  // total PO count across all statuses (0 = never created one)
  rulesMissingCost:          number;
  staleRepricingRules:       number;  // active rules not run in the last 14 days
  inventoryMissingCost:      number;
  inventoryMissingProduct:   number;
  possibleUnderpayments:     number;
  inventoryAtRisk:           number;
  inventoryAging:            number;
  // Phase 6 — Sales tracking
  salesMissingCost:          number;  // sale records with no unit cost (profit uncomputable)
  salesSyncOverdue:          boolean; // true when no sales data has ever been imported
  salesMissingFees:          number;  // sale records with no fee data (realized profit uncomputable)
  settlementUnmatched:           number;  // settlement fee groups that could not match a SaleRecord
  // Phase 6.11 — Refund/adjustment visibility (read-only; not applied to profit)
  refundRowsStored:               number;  // SettlementRecord rows with transactionType = 'Refund'
  unsupportedSettlementRowsStored: number;  // SettlementRecord rows with non-Order/Refund type
}

export function buildActionItems(inputs: ActionInputs): ActionItem[] {
  const items: ActionItem[] = [];

  if (inputs.failedPushes > 0) {
    items.push({
      priority:    'high',
      label:       `${inputs.failedPushes} repricing push${inputs.failedPushes !== 1 ? 'es' : ''} failed`,
      count:       inputs.failedPushes,
      href:        '/dashboard/repricing',
      description: `${inputs.failedPushes} price update${inputs.failedPushes !== 1 ? 's were' : ' was'} rejected by Amazon. Your listing price has not changed. Review the error and push again to stay competitive.`,
    });
  }

  if (inputs.pendingProposals > 0) {
    items.push({
      priority:    'high',
      label:       `${inputs.pendingProposals} price proposal${inputs.pendingProposals !== 1 ? 's' : ''} waiting for review`,
      count:       inputs.pendingProposals,
      href:        '/dashboard/repricing',
      description: `EALLsource found ${inputs.pendingProposals} recommended price change${inputs.pendingProposals !== 1 ? 's' : ''}. Nothing is sent to Amazon until you review and approve each one.`,
    });
  }

  if (inputs.inventoryAtRisk > 0) {
    items.push({
      priority:    'high',
      label:       `${inputs.inventoryAtRisk} inventory item${inputs.inventoryAtRisk !== 1 ? 's' : ''} at risk`,
      count:       inputs.inventoryAtRisk,
      href:        '/dashboard/inventory',
      description: `${inputs.inventoryAtRisk} item${inputs.inventoryAtRisk !== 1 ? 's have' : ' has'} a flag that could block your ability to sell — IP complaint history, brand restriction, or suppressed Buy Box. Review before buying more.`,
    });
  }

  if (inputs.totalPOs === 0) {
    items.push({
      priority:    'low',
      label:       'Create your first purchase order',
      count:       0,
      href:        '/dashboard/orders',
      description: 'Record inventory purchases so costs are tracked against future sales. Create a PO when you buy inventory.',
    });
  }

  if (inputs.openPOCount > 0 && inputs.pendingPOUnits > 0) {
    items.push({
      priority:    'medium',
      label:       `${inputs.pendingPOUnits} unit${inputs.pendingPOUnits !== 1 ? 's' : ''} not yet received`,
      count:       inputs.pendingPOUnits,
      href:        '/dashboard/orders',
      description: `${inputs.pendingPOUnits} ordered unit${inputs.pendingPOUnits !== 1 ? 's' : ''} across ${inputs.openPOCount} purchase order${inputs.openPOCount !== 1 ? 's' : ''} ${inputs.pendingPOUnits !== 1 ? 'have' : 'has'} not been received yet. Mark them received so your inventory count and value stay accurate.`,
    });
  }

  if (inputs.possibleUnderpayments > 0) {
    items.push({
      priority:    'medium',
      label:       `${inputs.possibleUnderpayments} possible reimbursement underpayment${inputs.possibleUnderpayments !== 1 ? 's' : ''}`,
      count:       inputs.possibleUnderpayments,
      href:        '/dashboard/recovery',
      description: `Amazon may have reimbursed less than your unit cost on ${inputs.possibleUnderpayments} item${inputs.possibleUnderpayments !== 1 ? 's' : ''}. Review each one against your purchase records before disputing.`,
    });
  }

  if (inputs.inventoryAging > 0) {
    items.push({
      priority:    'medium',
      label:       `${inputs.inventoryAging} aging inventory item${inputs.inventoryAging !== 1 ? 's' : ''}`,
      count:       inputs.inventoryAging,
      href:        '/dashboard/inventory',
      description: `${inputs.inventoryAging} item${inputs.inventoryAging !== 1 ? 's have' : ' has'} been in FBA for over 90 days. Long-term storage fees increase over time — consider lowering the price to improve sell-through.`,
    });
  }

  if (inputs.rulesMissingCost > 0) {
    items.push({
      priority:    'low',
      label:       `${inputs.rulesMissingCost} repricing rule${inputs.rulesMissingCost !== 1 ? 's' : ''} missing unit cost`,
      count:       inputs.rulesMissingCost,
      href:        '/dashboard/repricing',
      description: `${inputs.rulesMissingCost} repricing rule${inputs.rulesMissingCost !== 1 ? 's are' : ' is'} missing a unit cost. Without it, EALLsource cannot calculate a safe floor and cannot protect your margin when setting prices.`,
    });
  }

  if (inputs.staleRepricingRules > 0) {
    items.push({
      priority:    'low',
      label:       `${inputs.staleRepricingRules} repricing rule${inputs.staleRepricingRules !== 1 ? 's' : ''} not run recently`,
      count:       inputs.staleRepricingRules,
      href:        '/dashboard/repricing',
      description: `${inputs.staleRepricingRules} active repricing rule${inputs.staleRepricingRules !== 1 ? 's have' : ' has'} not run in over 14 days. Market prices shift — run the repricing engine to generate fresh proposals.`,
    });
  }

  if (inputs.inventoryMissingCost > 0) {
    items.push({
      priority:    'low',
      label:       `${inputs.inventoryMissingCost} inventory item${inputs.inventoryMissingCost !== 1 ? 's' : ''} missing unit cost`,
      count:       inputs.inventoryMissingCost,
      href:        '/dashboard/inventory',
      description: `${inputs.inventoryMissingCost} item${inputs.inventoryMissingCost !== 1 ? 's are' : ' is'} missing unit cost. Add what you paid so EALLsource can calculate your inventory value and enable margin protection in repricing.`,
    });
  }

  if (inputs.inventoryMissingProduct > 0) {
    items.push({
      priority:    'low',
      label:       `${inputs.inventoryMissingProduct} inventory item${inputs.inventoryMissingProduct !== 1 ? 's' : ''} with no scan data`,
      count:       inputs.inventoryMissingProduct,
      href:        '/dashboard/scanner',
      description: `${inputs.inventoryMissingProduct} inventory item${inputs.inventoryMissingProduct !== 1 ? 's have' : ' has'} no Amazon product data. Run a scanner search for ${inputs.inventoryMissingProduct !== 1 ? 'these ASINs' : 'this ASIN'} to unlock demand, health, and pricing insights.`,
    });
  }

  if (inputs.salesSyncOverdue) {
    items.push({
      priority:    'medium',
      label:       'No sales data imported yet',
      count:       1,
      href:        '/dashboard/sales',
      description: 'Download your Amazon flat-file orders report from Seller Central and import it to start seeing revenue, units sold, and gross profit in EALLsource.',
    });
  }

  if (inputs.salesMissingCost > 0) {
    items.push({
      priority:    'low',
      label:       `${inputs.salesMissingCost} sale record${inputs.salesMissingCost !== 1 ? 's' : ''} missing unit cost`,
      count:       inputs.salesMissingCost,
      href:        '/dashboard/sales?status=missing-cost',
      description: `Profit cannot be calculated for ${inputs.salesMissingCost} sold item${inputs.salesMissingCost !== 1 ? 's' : ''} because no unit cost was found. Add a unit cost to the matching inventory item${inputs.salesMissingCost !== 1 ? 's' : ''} to unlock gross and realized profit.`,
    });
  }

  if (inputs.salesMissingFees > 0) {
    items.push({
      priority:    'medium',
      label:       `${inputs.salesMissingFees} sale record${inputs.salesMissingFees !== 1 ? 's' : ''} missing settlement fees`,
      count:       inputs.salesMissingFees,
      href:        '/dashboard/sales?status=missing-fees',
      description: `Realized profit cannot be calculated for ${inputs.salesMissingFees} sold item${inputs.salesMissingFees !== 1 ? 's' : ''} because Amazon fee data has not been imported yet. Import a settlement report on the Sales page to add exact referral and FBA fees and unlock realized profit.`,
    });
  }

  if (inputs.settlementUnmatched > 0) {
    items.push({
      priority:    'low',
      label:       `${inputs.settlementUnmatched} settlement fee group${inputs.settlementUnmatched !== 1 ? 's' : ''} unmatched`,
      count:       inputs.settlementUnmatched,
      href:        '/dashboard/sales',
      description: `${inputs.settlementUnmatched} fee group${inputs.settlementUnmatched !== 1 ? 's' : ''} from your last settlement import could not be matched to a sales record. Import the orders report for the same period first, then re-import the settlement file.`,
    });
  }

  if (inputs.refundRowsStored > 0 || inputs.unsupportedSettlementRowsStored > 0) {
    const parts: string[] = [];
    if (inputs.refundRowsStored > 0)
      parts.push(`${inputs.refundRowsStored} refund row${inputs.refundRowsStored !== 1 ? 's' : ''}`);
    if (inputs.unsupportedSettlementRowsStored > 0)
      parts.push(`${inputs.unsupportedSettlementRowsStored} adjustment row${inputs.unsupportedSettlementRowsStored !== 1 ? 's' : ''}`);
    items.push({
      priority:    inputs.refundRowsStored > 0 ? 'medium' : 'low',
      label:       'Refunds/adjustments detected',
      count:       inputs.refundRowsStored + inputs.unsupportedSettlementRowsStored,
      href:        '/dashboard/sales',
      description: `Settlement imports include ${parts.join(' and ')} that are stored for review but not yet applied to realized profit.`,
    });
  }

  // Sort: high → medium → low
  const order: Record<ActionPriority, number> = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => order[a.priority] - order[b.priority]);
}
