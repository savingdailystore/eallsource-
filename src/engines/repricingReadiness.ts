export type ReadinessStatus =
  | 'READY'
  | 'PROPOSAL_PENDING'
  | 'MISSING_COST'
  | 'MISSING_SKU'
  | 'PUSH_FAILED'
  | 'NEVER_RUN'
  | 'PAUSED'
  | 'HOLDING';

export type ReadinessSeverity = 'ok' | 'info' | 'warning' | 'error' | 'muted';

export interface ReadinessResult {
  status:   ReadinessStatus;
  label:    string;
  severity: ReadinessSeverity;
  reason:   string;
  action:   string;
}

export interface ReadinessInput {
  isActive:           boolean;
  hasCostOrFloor:     boolean;
  hasSku:             boolean;
  hasPendingProposal: boolean;
  lastRepricedAt:     Date | null | undefined;
  lastHistoryStatus?: string | null;
}

// ── Strategy metadata ──────────────────────────────────────────────────────────

export const STRATEGY_META: Record<string, { label: string; desc: string }> = {
  COMPETITIVE: {
    label: 'Chase Buy Box',
    desc:  'Price 0.5% below the Buy Box to stay competitive, but never below your safe floor.',
  },
  FLOOR: {
    label: 'Protect Profit',
    desc:  'Always price at your safe floor — the lowest price that still clears your margins.',
  },
  CEILING: {
    label: 'Price High',
    desc:  'Price at or slightly above the Buy Box to capture maximum margin.',
  },
};

// ── Floor estimate ─────────────────────────────────────────────────────────────
// Uses the same default assumptions as calculateReprice():
//   referral 15%, FBA $4.56 (1 lb), storage $0.50, prep $0
//   sales tax 8.75% on the SOURCE cost (not resell price)
// Solves algebraically for the minimum sell price satisfying both
// the ROI floor and the profit floor simultaneously.
// Label all results as "estimated" in UI — real fees vary by product.

const NET_FACTOR     = 0.85;          // 1 - 0.15 referral
const FIXED_FEES     = 4.56 + 0.50;  // FBA + storage, no prep
const SOURCE_TAX     = 0.0875;

export interface FloorBreakdown {
  costBasis:      number;
  profitFloor:    number;
  roiFloor:       number;
  manualFloor:    number;
  effectiveFloor: number;
  bindingRule:    'profit' | 'roi' | 'manual' | 'none';
}

function ceilCents(v: number): number {
  return Math.ceil(v * 100) / 100;
}

export function estimateFloorBreakdown(
  costBasis:   number,
  minRoi:      number,
  minProfit:   number,
  manualFloor: number | null | undefined,
): FloorBreakdown {
  const manual = manualFloor ?? 0;

  if (costBasis <= 0) {
    return {
      costBasis: 0,
      profitFloor: 0,
      roiFloor: 0,
      manualFloor: manual,
      effectiveFloor: manual,
      bindingRule: manual > 0 ? 'manual' : 'none',
    };
  }

  const totalCostWithTax = costBasis * (1 + SOURCE_TAX);

  // Solve: P * 0.85 - FIXED_FEES - totalCostWithTax >= minProfit
  const profitFloor = ceilCents((minProfit + FIXED_FEES + totalCostWithTax) / NET_FACTOR);

  // Solve: (P * 0.85 - FIXED_FEES - totalCostWithTax) / costBasis >= minRoi/100
  const roiFloor = ceilCents((costBasis * (minRoi / 100) + FIXED_FEES + totalCostWithTax) / NET_FACTOR);

  const effectiveFloor = Math.max(profitFloor, roiFloor, manual);

  let bindingRule: FloorBreakdown['bindingRule'];
  if (effectiveFloor === 0) {
    bindingRule = 'none';
  } else if (manual >= profitFloor && manual >= roiFloor) {
    bindingRule = 'manual';
  } else if (roiFloor >= profitFloor) {
    bindingRule = 'roi';
  } else {
    bindingRule = 'profit';
  }

  return { costBasis, profitFloor, roiFloor, manualFloor: manual, effectiveFloor, bindingRule };
}

// ── Readiness ──────────────────────────────────────────────────────────────────

export function computeRepricingReadiness(input: ReadinessInput): ReadinessResult {
  const { isActive, hasCostOrFloor, hasSku, hasPendingProposal, lastRepricedAt, lastHistoryStatus } = input;

  if (!isActive) {
    return {
      status:   'PAUSED',
      label:    'Paused',
      severity: 'muted',
      reason:   'This rule is disabled and will be skipped on Run All.',
      action:   'Enable the rule to resume automatic repricing.',
    };
  }

  if (lastHistoryStatus === 'FAILED') {
    return {
      status:   'PUSH_FAILED',
      label:    'Push Failed',
      severity: 'error',
      reason:   "The last push to Amazon was rejected — usually the price was outside Amazon's allowed range or the SKU is inactive.",
      action:   'Review the error in Recent Activity, adjust your floor price, and try pushing again.',
    };
  }

  if (!hasCostOrFloor) {
    return {
      status:   'MISSING_COST',
      label:    'Missing Cost',
      severity: 'warning',
      reason:   'No unit cost and no manual floor price is set. Without one, the repricer cannot protect your margin.',
      action:   'Open the rule and enter your Unit Cost or a Manual Floor Price.',
    };
  }

  if (!hasSku) {
    return {
      status:   'MISSING_SKU',
      label:    'No SKU',
      severity: 'warning',
      reason:   'The repricer can recommend a price, but cannot push to Amazon without a seller SKU linked to this ASIN.',
      action:   'Sync your Amazon inventory to link a SKU to this ASIN.',
    };
  }

  if (hasPendingProposal) {
    return {
      status:   'PROPOSAL_PENDING',
      label:    'Review Pending',
      severity: 'info',
      reason:   'A new recommended price is waiting for your review.',
      action:   'Check the Price Proposals section and push when ready.',
    };
  }

  if (!lastRepricedAt) {
    return {
      status:   'NEVER_RUN',
      label:    'Never Run',
      severity: 'info',
      reason:   'This rule is configured but has never been run.',
      action:   'Click Run All Now (or Save & Run Now on the rule) to generate the first recommendation.',
    };
  }

  if (lastHistoryStatus === 'HOLD') {
    return {
      status:   'HOLDING',
      label:    'No Change',
      severity: 'ok',
      reason:   'The repricer ran and found no price change needed — current pricing is already optimal.',
      action:   'Run again any time to refresh against the latest Amazon prices.',
    };
  }

  return {
    status:   'READY',
    label:    'Ready',
    severity: 'ok',
    reason:   'This rule is active and fully configured.',
    action:   'Click Run All Now to refresh pricing against current Amazon data.',
  };
}

// ── Health score ───────────────────────────────────────────────────────────────
// Readiness answers "can this rule act right now?"
// Health answers "is this rule configured well?"

export type HealthStatus =
  | 'EXCELLENT'
  | 'GOOD'
  | 'NEEDS_SETUP'
  | 'RISKY_SETTINGS'
  | 'PUSH_FAILING'
  | 'NO_MARKET_DATA';

export interface HealthScoreInput {
  hasCostOrFloor:    boolean;
  hasSku:            boolean;
  lastRepricedAt:    Date | null | undefined;
  lastHistoryStatus: string | null | undefined;
  minRoi:            number;
  minProfit:         number;
}

export interface HealthResult {
  status:   HealthStatus;
  label:    string;
  severity: ReadinessSeverity;
  summary:  string;
}

export function computeHealthScore(input: HealthScoreInput): HealthResult {
  const { hasCostOrFloor, hasSku, lastRepricedAt, lastHistoryStatus, minRoi } = input;

  if (lastHistoryStatus === 'FAILED') {
    return {
      status:   'PUSH_FAILING',
      label:    'Push Failing',
      severity: 'error',
      summary:  'Last push was rejected by Amazon. Review the error and retry.',
    };
  }

  if (!hasCostOrFloor || !hasSku) {
    return {
      status:   'NEEDS_SETUP',
      label:    'Needs Setup',
      severity: 'warning',
      summary:  !hasCostOrFloor
        ? 'Add a unit cost or manual floor price to protect your margin.'
        : 'Sync Amazon inventory to link a seller SKU so prices can be pushed.',
    };
  }

  if (!lastRepricedAt) {
    return {
      status:   'NO_MARKET_DATA',
      label:    'No Market Data',
      severity: 'info',
      summary:  'This rule has never been run. Click Run All Now to get the first recommendation.',
    };
  }

  const daysSince = (Date.now() - lastRepricedAt.getTime()) / 86_400_000;

  if (daysSince > 14) {
    return {
      status:   'NO_MARKET_DATA',
      label:    'No Market Data',
      severity: 'info',
      summary:  `Last run ${Math.round(daysSince)} days ago — market data may be stale.`,
    };
  }

  if (minRoi > 70) {
    return {
      status:   'RISKY_SETTINGS',
      label:    'Risky Settings',
      severity: 'warning',
      summary:  `Min ROI of ${minRoi}% is very high — the floor may exceed the market price, causing the rule to always hold.`,
    };
  }

  if (daysSince <= 7) {
    return {
      status:   'EXCELLENT',
      label:    'Excellent',
      severity: 'ok',
      summary:  'Well configured and running on fresh market data.',
    };
  }

  return {
    status:   'GOOD',
    label:    'Good',
    severity: 'ok',
    summary:  'Configured correctly — consider running more frequently for fresher data.',
  };
}

// ── Risk factors ───────────────────────────────────────────────────────────────

export type RiskFactor =
  | 'large_price_drop'
  | 'large_price_rise'
  | 'near_floor'
  | 'high_fba_competition'
  | 'missing_buy_box'
  | 'stale_market_data'
  | 'floor_bound'
  | 'missing_cost_basis';

export const RISK_FACTOR_LABELS: Record<RiskFactor, string> = {
  large_price_drop:     'Large price drop (>15%)',
  large_price_rise:     'Large price increase (>25%)',
  near_floor:           'Near safe floor (<5% above floor)',
  high_fba_competition: 'High FBA competition',
  missing_buy_box:      'Missing Buy Box data',
  stale_market_data:    'Stale market data (proposal >48h old)',
  floor_bound:          'Safe floor limits the price movement',
  missing_cost_basis:   'No cost basis — floor relies on manual floor only',
};

export interface RiskFactorInput {
  direction:        string;
  previousPrice:    number | null;
  recommendedPrice: number;
  estimatedFloor:   number | null;
  buyBoxPrice:      number | null;
  dataAgeHours:     number;
  hasCostBasis:     boolean;
  riskScore:        number;
  reason:           string | null;
}

export function computeRiskFactors(input: RiskFactorInput): RiskFactor[] {
  const {
    direction, previousPrice, recommendedPrice, estimatedFloor,
    buyBoxPrice, dataAgeHours, hasCostBasis, riskScore, reason,
  } = input;

  const factors: RiskFactor[] = [];
  const r = reason?.toLowerCase() ?? '';

  // Large price drop (>15%)
  if (direction === 'DOWN' && previousPrice != null && previousPrice > 0) {
    if ((previousPrice - recommendedPrice) / previousPrice > 0.15) {
      factors.push('large_price_drop');
    }
  }

  // Large price rise (>25%)
  if (direction === 'UP' && previousPrice != null && previousPrice > 0) {
    if ((recommendedPrice - previousPrice) / previousPrice > 0.25) {
      factors.push('large_price_rise');
    }
  }

  // Near safe floor (within 5% of floor)
  if (estimatedFloor != null && estimatedFloor > 0 && recommendedPrice > 0) {
    if ((recommendedPrice - estimatedFloor) / recommendedPrice < 0.05) {
      factors.push('near_floor');
    }
  }

  // High FBA competition — engine sets reason with 'competition', fallback to riskScore
  if (r.includes('competition') || (!reason && riskScore >= 65)) {
    factors.push('high_fba_competition');
  }

  // Missing Buy Box data
  if (buyBoxPrice == null || buyBoxPrice <= 0) {
    factors.push('missing_buy_box');
  }

  // Stale market data (proposal > 48h old)
  if (dataAgeHours >= 48) {
    factors.push('stale_market_data');
  }

  // Floor-bound: engine held price at safe floor (not intentional FLOOR strategy pricing)
  if (r.includes('floor') && (r.includes('hold') || r.includes('protected'))) {
    factors.push('floor_bound');
  }

  // Missing cost basis
  if (!hasCostBasis) {
    factors.push('missing_cost_basis');
  }

  return factors;
}

// ── Risk level ─────────────────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'very_high';

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low:       'Low Risk',
  medium:    'Medium Risk',
  high:      'High Risk',
  very_high: 'Very High Risk',
};

export const RISK_LEVEL_COLORS: Record<RiskLevel, string> = {
  low:       'text-green-400',
  medium:    'text-blue-400',
  high:      'text-amber-400',
  very_high: 'text-red-400',
};

export function riskScoreToLevel(score: number): RiskLevel {
  if (score < 30) return 'low';
  if (score < 55) return 'medium';
  if (score < 75) return 'high';
  return 'very_high';
}
