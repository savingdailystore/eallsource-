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
  return Math.floor(total * 0.03); // top 3%
}

export function assessDemand(input: DemandInput): DemandResult {
  const { bsr, category, fbaSellers, totalSellers } = input;
  const reasons: string[] = [];

  const percentile = bsrToPercentile(bsr, category);
  const bsrLimit   = getBsrLimit(category);

  // BSR gating — reject if not top 3%
  if (bsr > bsrLimit) {
    return {
      level: 'LOW',
      reasons: [`BSR ${bsr.toLocaleString()} exceeds limit ${bsrLimit.toLocaleString()} for ${category} (top 3%)`],
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
  } else if (percentile < 3) {
    level = 'MEDIUM';
    reasons.push(`Good BSR: top ${percentile.toFixed(2)}%`);
  } else {
    level = 'LOW';
    reasons.push(`Weak BSR: top ${percentile.toFixed(2)}%`);
  }

  // Downgrade if too competitive
  if (fbaSellers > 15 && level === 'HIGH') level = 'MEDIUM';

  return { level, reasons };
}
