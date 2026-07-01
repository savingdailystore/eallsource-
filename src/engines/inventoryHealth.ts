// Inventory Health Engine — pure functions, no DB, no framework imports.
// All inputs come from InventoryItem + optional Product + optional RepricingRule.
//
// DATA HONESTY RULES (enforced here):
//  - purchasedAt, when user-supplied, is used for true aging (labeled "purchased X days ago").
//  - createdAt is used only as a "tracked since" proxy when purchasedAt is absent.
//  - Sales velocity, days-remaining, and reorder dates are NOT computed.
//  - If Product is absent, status is UNKNOWN — we never fabricate insights.
//  - Unit cost: InventoryItem.unitCost takes priority; RepricingRule.costBasis is a fallback.
//  - inventoryValue is only computed when a unit cost is known; never estimated.

export type HealthStatus =
  | 'HEALTHY'
  | 'REORDER_SOON'
  | 'OVERSTOCKED'
  | 'AGING'
  | 'LOW_MARGIN'
  | 'AT_RISK'
  | 'UNKNOWN';

export type RestockSignal =
  | 'REORDER_NOW'
  | 'REORDER_SOON'
  | 'HOLD'
  | 'DO_NOT_REORDER'
  | 'UNKNOWN';

export type AgingBucket = '0-30' | '31-60' | '61-90' | '90+';

// ─── Input types ───────────────────────────────────────────────────────────

export interface InventoryProductSnapshot {
  roi:                  number;
  profit:               number;
  price:                number;
  demandLevel:          string; // DemandLevel enum value: HIGH | MEDIUM | LOW | UNKNOWN
  monthlySales?:        number | null;
  fbaSellers?:          number | null;
  totalSellers?:        number | null;
  amazonIsSeller:       boolean;
  amazonOwnsBuyBox:     boolean;
  buyBoxSuppressed:     boolean;
  gatingRisk:           string; // GatingRisk enum: LOW | MEDIUM | HIGH
  hasIpComplaintHistory: boolean;
  isBrandRestricted:    boolean;
  priceTrend?:          string | null;
  priceStability?:      string | null;
  score:                number;
  bsr?:                 number | null;
}

export interface InventoryRepricingSnapshot {
  costBasis?:            number | null;
  lastRecommendedPrice?: number | null;
  lastDirection?:        string | null;
  lastRepricedAt?:       Date   | null;
  isActive:              boolean;
}

export interface InventoryHealthInput {
  availableQuantity: number;
  reservedQuantity:  number;
  inboundQuantity:   number;
  totalQuantity:     number;
  createdAt:         Date;
  purchasedAt?:      Date | null; // User-supplied true acquisition date; absent = fall back to createdAt
  unitCost?:         number | null; // Cost per unit; takes priority over repricing.costBasis
  product?:          InventoryProductSnapshot;
  repricing?:        InventoryRepricingSnapshot;
}

// ─── Result type ───────────────────────────────────────────────────────────

export interface InventoryHealthResult {
  status:           HealthStatus;
  restockSignal:    RestockSignal;
  reasons:          string[];
  riskFactors:      string[];
  recommendation:   string;
  agingBucket:      AgingBucket;
  agingDays:        number; // Days used for aging: purchasedAt-based when available, else createdAt-based
  agingSource:      'purchased' | 'tracked'; // Which date was used — controls display wording
  daysSinceTracked: number; // Always createdAt-based (kept for diagnostics)
  // null when no Product is linked (UNKNOWN status)
  profitSummary: {
    roi:       number;
    profit:    number;
    price:     number;
    // costBasis kept for backward compat (raw repricing value, not the resolved unit cost)
    costBasis?: number;
  } | null;
  // Independent of scan data — populated whenever unit cost is known (item or repricing fallback).
  // null only when no cost data is available at all.
  costSummary: {
    unitCost:       number;
    unitCostSource: 'item' | 'repricing';
    inventoryValue: number; // availableQty × unitCost; 0 when qty is 0
  } | null;
  demandSummary: {
    level:         string;
    monthlySales?: number | null;
    fbaSellers?:   number | null;
    bsr?:          number | null;
  } | null;
}

// ─── Thresholds ────────────────────────────────────────────────────────────

const LOW_MARGIN_ROI_PCT    = 15;   // ROI below this → LOW_MARGIN
const LOW_MARGIN_PROFIT_USD = 3;    // Profit below this → LOW_MARGIN
const AGING_DAYS            = 90;   // Days before AGING status (uses purchasedAt when available)
const OVERSTOCKED_QTY       = 30;   // Units in stock where low demand triggers OVERSTOCKED
const LOW_STOCK_QTY         = 3;    // Available units at which REORDER_SOON fires
const HEALTHY_ROI_FLOOR     = 20;   // Min ROI for REORDER_SOON / REORDER_NOW signals
const DO_NOT_REORDER_ROI    = 10;   // ROI below this → DO_NOT_REORDER

// ─── Helpers ───────────────────────────────────────────────────────────────

export function getAgingBucket(days: number): AgingBucket {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

// ─── Restock signal ────────────────────────────────────────────────────────
//
// Conservative reorder signal derived from quantity + demand + profitability.
// Does NOT compute exact reorder dates or days-of-inventory-remaining
// because true sales velocity is not tracked by EALLsource.

export function computeRestockSignal(
  availableQuantity: number,
  inboundQuantity:   number,
  product:           InventoryProductSnapshot | undefined,
): RestockSignal {
  if (!product) return 'UNKNOWN';

  const hasRiskFlag =
    product.hasIpComplaintHistory ||
    (product.gatingRisk === 'HIGH' && product.isBrandRestricted) ||
    (product.buyBoxSuppressed && product.amazonOwnsBuyBox);

  if (hasRiskFlag || product.roi < DO_NOT_REORDER_ROI || product.demandLevel === 'LOW') {
    return 'DO_NOT_REORDER';
  }

  const goodMetrics =
    product.demandLevel !== 'LOW' &&
    product.roi >= HEALTHY_ROI_FLOOR &&
    !hasRiskFlag;

  if (availableQuantity === 0 && inboundQuantity === 0 && goodMetrics) {
    return 'REORDER_NOW';
  }

  if (availableQuantity <= LOW_STOCK_QTY && inboundQuantity === 0 && goodMetrics) {
    return 'REORDER_SOON';
  }

  return 'HOLD';
}

// ─── Recommendation text ───────────────────────────────────────────────────

function buildRecommendation(
  status:     HealthStatus,
  agingDays:  number,
  agingSource: 'purchased' | 'tracked',
  available:  number,
  demandLevel: string,
): string {
  switch (status) {
    case 'AT_RISK':
      return 'Review immediately — this item has active risk factors that may prevent sales.';
    case 'LOW_MARGIN':
      return 'Review pricing or avoid reordering — margin is below viable threshold.';
    case 'AGING': {
      const ageLabel = agingSource === 'purchased'
        ? `purchased ${agingDays} days ago`
        : `tracked for ${agingDays} days`;
      return `Consider reducing price to improve sell-through — ${ageLabel}.`;
    }
    case 'OVERSTOCKED':
      return `${available} units in stock with ${demandLevel} demand — monitor sell-through carefully before reordering.`;
    case 'REORDER_SOON':
      return 'Stock is low and demand signals are positive — consider reordering.';
    case 'HEALTHY':
      return 'Item looks healthy. Monitor for price trend or competition changes.';
    case 'UNKNOWN':
      return 'No scan data available for this ASIN. Run a scanner search to unlock health insights.';
  }
}

// ─── Main engine ───────────────────────────────────────────────────────────

export function evaluateInventoryHealth(input: InventoryHealthInput): InventoryHealthResult {
  const { availableQuantity, inboundQuantity, product, repricing, createdAt, purchasedAt, unitCost } = input;

  const now              = new Date();
  const daysSinceTracked = daysBetween(createdAt, now);

  // Aging: prefer true purchase date over tracking date when user has supplied it.
  const hasPurchaseDate = purchasedAt != null;
  const agingDays       = hasPurchaseDate ? daysBetween(purchasedAt!, now) : daysSinceTracked;
  const agingSource     = hasPurchaseDate ? 'purchased' : 'tracked' as const;
  const agingBucket     = getAgingBucket(agingDays);

  // Unit cost resolution: item-level first, repricing fallback, then null.
  const resolvedUnitCost  = unitCost ?? repricing?.costBasis ?? null;
  const unitCostSource: 'item' | 'repricing' | null =
    unitCost != null             ? 'item'      :
    repricing?.costBasis != null ? 'repricing' : null;

  const restockSignal = computeRestockSignal(availableQuantity, inboundQuantity, product);

  // costSummary is independent of Product scan data — computed once, used in both branches.
  const costSummary = resolvedUnitCost != null
    ? {
        unitCost:       resolvedUnitCost,
        unitCostSource: unitCostSource as 'item' | 'repricing',
        inventoryValue: availableQuantity * resolvedUnitCost,
      }
    : null;

  // No scan data — return UNKNOWN without fabricating any signals.
  if (!product) {
    return {
      status:           'UNKNOWN',
      restockSignal:    'UNKNOWN',
      reasons:          ['No scan data linked to this ASIN — market intelligence unavailable.'],
      riskFactors:      [],
      recommendation:   buildRecommendation('UNKNOWN', agingDays, agingSource, availableQuantity, ''),
      agingBucket,
      agingDays,
      agingSource,
      daysSinceTracked,
      profitSummary:    null,
      costSummary,
      demandSummary:    null,
    };
  }

  // Collect all risk factors (shown regardless of primary status).
  const riskFactors: string[] = [];
  if (product.hasIpComplaintHistory)
    riskFactors.push('Confirmed IP complaint history');
  if (product.gatingRisk === 'HIGH' && product.isBrandRestricted)
    riskFactors.push('Brand restricted with HIGH gating risk');
  if (product.buyBoxSuppressed && product.amazonOwnsBuyBox)
    riskFactors.push('Buy box suppressed — Amazon controls pricing');
  if (product.amazonIsSeller)
    riskFactors.push('Amazon is an active competing seller');
  if (product.priceTrend === 'DECLINING')
    riskFactors.push('Price trend is declining');

  // ── Status determination (priority: AT_RISK > LOW_MARGIN > REORDER_SOON >
  //                                    OVERSTOCKED > AGING > HEALTHY)
  let status: HealthStatus;
  const reasons: string[] = [];

  const isAtRisk =
    product.hasIpComplaintHistory ||
    (product.gatingRisk === 'HIGH' && product.isBrandRestricted) ||
    (product.buyBoxSuppressed && product.amazonOwnsBuyBox);

  if (isAtRisk) {
    status = 'AT_RISK';
    if (product.hasIpComplaintHistory)
      reasons.push('IP complaint history on record for this ASIN');
    if (product.gatingRisk === 'HIGH' && product.isBrandRestricted)
      reasons.push('Brand restricted — potential ungating required');
    if (product.buyBoxSuppressed && product.amazonOwnsBuyBox)
      reasons.push('Amazon suppressed the buy box on this listing');

  } else if (product.roi < LOW_MARGIN_ROI_PCT || product.profit < LOW_MARGIN_PROFIT_USD) {
    status = 'LOW_MARGIN';
    if (product.roi < LOW_MARGIN_ROI_PCT)
      reasons.push(`ROI ${product.roi.toFixed(1)}% is below the ${LOW_MARGIN_ROI_PCT}% minimum`);
    if (product.profit < LOW_MARGIN_PROFIT_USD)
      reasons.push(`Profit $${product.profit.toFixed(2)} is below the $${LOW_MARGIN_PROFIT_USD.toFixed(2)} floor`);

  } else if (
    availableQuantity <= LOW_STOCK_QTY &&
    inboundQuantity === 0 &&
    product.demandLevel !== 'LOW' &&
    product.roi >= HEALTHY_ROI_FLOOR
  ) {
    status = 'REORDER_SOON';
    reasons.push(
      `${availableQuantity} unit${availableQuantity !== 1 ? 's' : ''} available, none inbound`,
    );
    reasons.push(`Demand: ${product.demandLevel} — ROI: ${product.roi.toFixed(1)}%`);

  } else if (availableQuantity > OVERSTOCKED_QTY && product.demandLevel === 'LOW') {
    status = 'OVERSTOCKED';
    reasons.push(`${availableQuantity} units in stock with LOW demand signal`);
    if (product.fbaSellers != null)
      reasons.push(`${product.fbaSellers} FBA seller${product.fbaSellers !== 1 ? 's' : ''} competing`);

  } else if (agingDays > AGING_DAYS && availableQuantity > 0) {
    status = 'AGING';
    if (hasPurchaseDate) {
      reasons.push(`Purchased ${agingDays} days ago — inventory may be moving slowly`);
    } else {
      reasons.push(`Tracked for ${agingDays} days — inventory may be moving slowly`);
    }
    reasons.push(`${availableQuantity} unit${availableQuantity !== 1 ? 's' : ''} still available`);

  } else {
    status = 'HEALTHY';
    reasons.push(`ROI ${product.roi.toFixed(1)}% — demand: ${product.demandLevel}`);
    if (inboundQuantity > 0)
      reasons.push(`${inboundQuantity} unit${inboundQuantity !== 1 ? 's' : ''} inbound`);
  }

  return {
    status,
    restockSignal,
    reasons,
    riskFactors,
    recommendation: buildRecommendation(
      status, agingDays, agingSource, availableQuantity, product.demandLevel,
    ),
    agingBucket,
    agingDays,
    agingSource,
    daysSinceTracked,
    profitSummary: {
      roi:    product.roi,
      profit: product.profit,
      price:  product.price,
      // costBasis kept for backward compat
      ...(repricing?.costBasis != null ? { costBasis: repricing.costBasis } : {}),
    },
    costSummary,
    demandSummary: {
      level:        product.demandLevel,
      monthlySales: product.monthlySales ?? null,
      fbaSellers:   product.fbaSellers ?? null,
      bsr:          product.bsr ?? null,
    },
  };
}
