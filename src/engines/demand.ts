import type { DemandInput, DemandResult, DemandLevel } from '@/types';

// Category BSR limits for "top 3%" (approx total products per category)
const CATEGORY_TOTALS: Record<string, number> = {
  'Toys & Games':         1_700_000,
  'Electronics':          3_300_000,
  'Sports & Outdoors':    2_500_000,
  'Home & Kitchen':       5_000_000,
  'Health & Beauty':      2_700_000,
  'Health & Household':   2_700_000,
  'Clothing':             6_700_000,
  'Books':               16_000_000,
  'Video Games':          1_000_000,
  'Pet Supplies':         1_200_000,
  'Office Products':      1_500_000,
  'Grocery & Gourmet Food': 2_000_000,
  'Baby':                   800_000,
  'default':              3_000_000,
};

export function bsrToPercentile(bsr: number, category: string): number {
  const total = CATEGORY_TOTALS[category] ?? CATEGORY_TOTALS['default'];
  return Math.min(99.9, (bsr / total) * 100);
}

export function getBsrLimit(category: string): number {
  const total = CATEGORY_TOTALS[category] ?? CATEGORY_TOTALS['default'];
  return Math.floor(total * 0.06); // top 6% — top 3% was rejecting too many genuinely sellable items
}

// Hard caps on seller saturation — a "profitable" listing with this many
// competitors rarely holds its margin; it's a race to the bottom on price.
const MAX_TOTAL_SELLERS = 20;
const MAX_FBA_SELLERS   = 8;

// Minimum expected units/month for YOU after splitting demand across existing
// FBA sellers. Below this, even a top-rank item won't move enough inventory to
// be worth sourcing. Only applied when we actually have a velocity estimate.
const MIN_EXPECTED_UNITS_PER_SELLER = 2;

// Expected monthly units you'd capture by joining the listing: total monthly
// sales split across existing FBA sellers + you. Conservative — assumes demand
// divides evenly, which understates the buy-box winner's share but is the right
// direction for a "will this actually sell" floor.
export function expectedUnitsPerSeller(monthlySales: number, fbaSellers: number): number {
  return monthlySales / (Math.max(0, fbaSellers) + 1);
}

export function assessDemand(input: DemandInput): DemandResult {
  const { bsr, category, fbaSellers, totalSellers, monthlySales } = input;
  const reasons: string[] = [];

  const percentile = bsrToPercentile(bsr, category);
  const bsrLimit   = getBsrLimit(category);

  // Velocity / expected-share — computed once, echoed through every return path.
  const share = monthlySales != null ? expectedUnitsPerSeller(monthlySales, fbaSellers) : undefined;
  const velocityTooLow = share != null && share < MIN_EXPECTED_UNITS_PER_SELLER;
  const velocity = { monthlySales, expectedUnitsPerSeller: share };

  // BSR gating — reject if not top 6%
  if (bsr > bsrLimit) {
    return {
      level: 'LOW',
      reasons: [`BSR ${bsr.toLocaleString()} exceeds limit ${bsrLimit.toLocaleString()} for ${category} (top 6%)`],
      ...velocity, velocityTooLow,
    };
  }

  // Seller saturation gating — reject regardless of BSR if the listing is oversaturated
  if (totalSellers > MAX_TOTAL_SELLERS || fbaSellers > MAX_FBA_SELLERS) {
    return {
      level: 'LOW',
      reasons: [`Oversaturated: ${totalSellers} total sellers (max ${MAX_TOTAL_SELLERS}), ${fbaSellers} FBA (max ${MAX_FBA_SELLERS})`],
      ...velocity, velocityTooLow,
    };
  }

  // Velocity gating — strong rank but the demand, split across sellers, leaves
  // too few units for you to actually move.
  if (velocityTooLow) {
    return {
      level: 'LOW',
      reasons: [`Low expected sales: ~${share!.toFixed(1)} units/mo for you (${monthlySales}/mo split across ${fbaSellers} FBA sellers, need ≥ ${MIN_EXPECTED_UNITS_PER_SELLER})`],
      ...velocity, velocityTooLow,
    };
  }

  // Competition check
  if (fbaSellers > 15) {
    reasons.push(`High FBA competition: ${fbaSellers} FBA sellers`);
  }
  if (totalSellers > 30) {
    reasons.push(`High total competition: ${totalSellers} sellers`);
  }

  // Score based on BSR percentile
  let level: DemandLevel;
  if (percentile < 0.5) {
    level = 'HIGH';
    reasons.push(`Excellent BSR: top ${percentile.toFixed(2)}%`);
  } else if (percentile < 2) {
    level = 'HIGH';
    reasons.push(`Strong BSR: top ${percentile.toFixed(2)}%`);
  } else if (percentile < 6) {
    level = 'MEDIUM';
    reasons.push(`Good BSR: top ${percentile.toFixed(2)}%`);
  } else {
    level = 'LOW';
    reasons.push(`Weak BSR: top ${percentile.toFixed(2)}%`);
  }

  // Downgrade if too competitive
  if (fbaSellers > 15 && level === 'HIGH') level = 'MEDIUM';

  // Surface the velocity read even when it passes the floor.
  if (share != null) {
    reasons.push(`Expected ~${share.toFixed(1)} units/mo for you (${monthlySales}/mo across ${fbaSellers} FBA sellers)`);
  }

  return { level, reasons, ...velocity, velocityTooLow };
}
