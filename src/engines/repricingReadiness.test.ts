import { describe, it, expect } from 'vitest';
import {
  computeRepricingReadiness,
  estimateFloorBreakdown,
  STRATEGY_META,
  computeHealthScore,
  computeRiskFactors,
  riskScoreToLevel,
  type ReadinessInput,
  type HealthScoreInput,
  type RiskFactorInput,
} from './repricingReadiness';

// ── Base input (fully configured, active rule that ran and is clean) ───────────

const READY_INPUT: ReadinessInput = {
  isActive:           true,
  hasCostOrFloor:     true,
  hasSku:             true,
  hasPendingProposal: false,
  lastRepricedAt:     new Date(),
  lastHistoryStatus:  'PUSHED',
};

// ── computeRepricingReadiness — all 8 statuses ────────────────────────────────

describe('computeRepricingReadiness', () => {
  it('returns READY for a fully configured, recently run rule', () => {
    const r = computeRepricingReadiness(READY_INPUT);
    expect(r.status).toBe('READY');
    expect(r.severity).toBe('ok');
    expect(r.label).toBeTruthy();
    expect(r.reason).toBeTruthy();
    expect(r.action).toBeTruthy();
  });

  it('returns PAUSED when isActive is false (regardless of other fields)', () => {
    const r = computeRepricingReadiness({ ...READY_INPUT, isActive: false });
    expect(r.status).toBe('PAUSED');
    expect(r.severity).toBe('muted');
  });

  it('PAUSED takes priority over PUSH_FAILED', () => {
    const r = computeRepricingReadiness({
      ...READY_INPUT,
      isActive: false,
      lastHistoryStatus: 'FAILED',
    });
    expect(r.status).toBe('PAUSED');
  });

  it('returns PUSH_FAILED when the most recent history entry is FAILED', () => {
    const r = computeRepricingReadiness({ ...READY_INPUT, lastHistoryStatus: 'FAILED' });
    expect(r.status).toBe('PUSH_FAILED');
    expect(r.severity).toBe('error');
  });

  it('returns MISSING_COST when active but hasCostOrFloor is false', () => {
    const r = computeRepricingReadiness({
      ...READY_INPUT,
      hasCostOrFloor: false,
      lastHistoryStatus: null,
    });
    expect(r.status).toBe('MISSING_COST');
    expect(r.severity).toBe('warning');
  });

  it('MISSING_COST takes priority over MISSING_SKU', () => {
    const r = computeRepricingReadiness({
      ...READY_INPUT,
      hasCostOrFloor: false,
      hasSku: false,
      lastHistoryStatus: null,
    });
    expect(r.status).toBe('MISSING_COST');
  });

  it('returns MISSING_SKU when active, has cost/floor, but no SKU', () => {
    const r = computeRepricingReadiness({
      ...READY_INPUT,
      hasSku: false,
      lastRepricedAt: null,
      lastHistoryStatus: null,
    });
    expect(r.status).toBe('MISSING_SKU');
    expect(r.severity).toBe('warning');
  });

  it('returns PROPOSAL_PENDING when a pending proposal exists', () => {
    const r = computeRepricingReadiness({ ...READY_INPUT, hasPendingProposal: true });
    expect(r.status).toBe('PROPOSAL_PENDING');
    expect(r.severity).toBe('info');
  });

  it('PROPOSAL_PENDING takes priority over NEVER_RUN', () => {
    const r = computeRepricingReadiness({
      ...READY_INPUT,
      hasPendingProposal: true,
      lastRepricedAt: null,
    });
    expect(r.status).toBe('PROPOSAL_PENDING');
  });

  it('returns NEVER_RUN when active, configured, but lastRepricedAt is null', () => {
    const r = computeRepricingReadiness({
      ...READY_INPUT,
      hasPendingProposal: false,
      lastRepricedAt: null,
      lastHistoryStatus: null,
    });
    expect(r.status).toBe('NEVER_RUN');
    expect(r.severity).toBe('info');
  });

  it('returns HOLDING when last history status is HOLD', () => {
    const r = computeRepricingReadiness({ ...READY_INPUT, lastHistoryStatus: 'HOLD' });
    expect(r.status).toBe('HOLDING');
    expect(r.severity).toBe('ok');
  });

  it('returns READY when lastHistoryStatus is SUPERSEDED (not a terminal fail/hold)', () => {
    const r = computeRepricingReadiness({ ...READY_INPUT, lastHistoryStatus: 'SUPERSEDED' });
    expect(r.status).toBe('READY');
  });
});

// ── STRATEGY_META — label mapping ──────────────────────────────────────────────

describe('STRATEGY_META', () => {
  it('maps COMPETITIVE to Chase Buy Box', () => {
    expect(STRATEGY_META['COMPETITIVE'].label).toBe('Chase Buy Box');
    expect(STRATEGY_META['COMPETITIVE'].desc).toBeTruthy();
  });

  it('maps FLOOR to Protect Profit', () => {
    expect(STRATEGY_META['FLOOR'].label).toBe('Protect Profit');
    expect(STRATEGY_META['FLOOR'].desc).toBeTruthy();
  });

  it('maps CEILING to Price High', () => {
    expect(STRATEGY_META['CEILING'].label).toBe('Price High');
    expect(STRATEGY_META['CEILING'].desc).toBeTruthy();
  });

  it('covers all three strategies', () => {
    expect(Object.keys(STRATEGY_META)).toEqual(
      expect.arrayContaining(['COMPETITIVE', 'FLOOR', 'CEILING']),
    );
  });
});

// ── estimateFloorBreakdown ─────────────────────────────────────────────────────

describe('estimateFloorBreakdown', () => {
  it('returns zeroes for zero cost with no manual floor', () => {
    const r = estimateFloorBreakdown(0, 30, 5, null);
    expect(r.effectiveFloor).toBe(0);
    expect(r.bindingRule).toBe('none');
    expect(r.costBasis).toBe(0);
  });

  it('returns manual floor as effective when cost is zero', () => {
    const r = estimateFloorBreakdown(0, 30, 5, 15);
    expect(r.effectiveFloor).toBe(15);
    expect(r.bindingRule).toBe('manual');
  });

  it('profit floor is binding when minProfit constraint exceeds minRoi constraint', () => {
    // costBasis=10, minRoi=30, minProfit=5
    // profitFloor = (5 + 5.06 + 10.875) / 0.85 = 24.63
    // roiFloor    = (3  + 5.06 + 10.875) / 0.85 = 22.28
    const r = estimateFloorBreakdown(10, 30, 5, null);
    expect(r.bindingRule).toBe('profit');
    expect(r.profitFloor).toBeGreaterThan(r.roiFloor);
    expect(r.effectiveFloor).toBe(r.profitFloor);
    expect(r.profitFloor).toBeCloseTo(24.63, 1);
  });

  it('ROI floor is binding when minRoi constraint exceeds minProfit constraint', () => {
    // costBasis=20, minRoi=50, minProfit=2
    // profitFloor = (2  + 5.06 + 21.75) / 0.85 = ~33.90
    // roiFloor    = (10 + 5.06 + 21.75) / 0.85 = ~43.31
    const r = estimateFloorBreakdown(20, 50, 2, null);
    expect(r.bindingRule).toBe('roi');
    expect(r.roiFloor).toBeGreaterThan(r.profitFloor);
    expect(r.effectiveFloor).toBe(r.roiFloor);
    expect(r.roiFloor).toBeCloseTo(43.31, 1);
  });

  it('manual floor is binding when it exceeds both computed floors', () => {
    // costBasis=10, minRoi=20, minProfit=2, manualFloor=30
    // profitFloor ≈ 21.1, roiFloor ≈ 21.1 → effectiveFloor = 30
    const r = estimateFloorBreakdown(10, 20, 2, 30);
    expect(r.bindingRule).toBe('manual');
    expect(r.effectiveFloor).toBe(30);
    expect(r.manualFloor).toBe(30);
  });

  it('effectiveFloor is always at least max(profitFloor, roiFloor, manualFloor)', () => {
    const r = estimateFloorBreakdown(15, 40, 8, 25);
    const computed = Math.max(r.profitFloor, r.roiFloor, r.manualFloor);
    expect(r.effectiveFloor).toBeCloseTo(computed, 2);
  });

  it('all floor values are positive for realistic inputs', () => {
    const r = estimateFloorBreakdown(12, 25, 4, null);
    expect(r.profitFloor).toBeGreaterThan(0);
    expect(r.roiFloor).toBeGreaterThan(0);
    expect(r.effectiveFloor).toBeGreaterThan(r.costBasis);
  });

  it('higher minRoi produces a higher ROI floor', () => {
    const low  = estimateFloorBreakdown(10, 10, 5, null);
    const high = estimateFloorBreakdown(10, 80, 5, null);
    expect(high.roiFloor).toBeGreaterThan(low.roiFloor);
  });

  it('higher minProfit produces a higher profit floor', () => {
    const low  = estimateFloorBreakdown(10, 30, 2, null);
    const high = estimateFloorBreakdown(10, 30, 20, null);
    expect(high.profitFloor).toBeGreaterThan(low.profitFloor);
  });

  it('returns effectiveFloor ≥ manualFloor at all times', () => {
    const r = estimateFloorBreakdown(10, 100, 10, 5);
    expect(r.effectiveFloor).toBeGreaterThanOrEqual(5);
  });
});

// ── computeHealthScore ────────────────────────────────────────────────────────

describe('computeHealthScore', () => {
  const BASE: HealthScoreInput = {
    hasCostOrFloor:    true,
    hasSku:            true,
    lastRepricedAt:    new Date(Date.now() - 2 * 86_400_000), // 2 days ago
    lastHistoryStatus: 'PUSHED',
    minRoi:            30,
    minProfit:         5,
  };

  it('EXCELLENT when run within 7 days with no issues', () => {
    const r = computeHealthScore(BASE);
    expect(r.status).toBe('EXCELLENT');
    expect(r.severity).toBe('ok');
    expect(r.summary).toBeTruthy();
  });

  it('GOOD when run between 7 and 14 days ago', () => {
    const r = computeHealthScore({ ...BASE, lastRepricedAt: new Date(Date.now() - 10 * 86_400_000) });
    expect(r.status).toBe('GOOD');
    expect(r.severity).toBe('ok');
  });

  it('PUSH_FAILING when last history status is FAILED', () => {
    const r = computeHealthScore({ ...BASE, lastHistoryStatus: 'FAILED' });
    expect(r.status).toBe('PUSH_FAILING');
    expect(r.severity).toBe('error');
  });

  it('NEEDS_SETUP when hasCostOrFloor is false', () => {
    const r = computeHealthScore({ ...BASE, hasCostOrFloor: false });
    expect(r.status).toBe('NEEDS_SETUP');
    expect(r.severity).toBe('warning');
    expect(r.summary).toContain('unit cost');
  });

  it('NEEDS_SETUP when hasSku is false', () => {
    const r = computeHealthScore({ ...BASE, hasSku: false });
    expect(r.status).toBe('NEEDS_SETUP');
    expect(r.severity).toBe('warning');
    expect(r.summary).toContain('SKU');
  });

  it('NO_MARKET_DATA when lastRepricedAt is null (never run)', () => {
    const r = computeHealthScore({ ...BASE, lastRepricedAt: null });
    expect(r.status).toBe('NO_MARKET_DATA');
    expect(r.severity).toBe('info');
  });

  it('NO_MARKET_DATA when run more than 14 days ago', () => {
    const r = computeHealthScore({ ...BASE, lastRepricedAt: new Date(Date.now() - 15 * 86_400_000) });
    expect(r.status).toBe('NO_MARKET_DATA');
    expect(r.summary).toContain('days ago');
  });

  it('RISKY_SETTINGS when minRoi > 70', () => {
    const r = computeHealthScore({ ...BASE, minRoi: 75 });
    expect(r.status).toBe('RISKY_SETTINGS');
    expect(r.severity).toBe('warning');
    expect(r.summary).toContain('75%');
  });

  it('PUSH_FAILING takes priority over NEEDS_SETUP', () => {
    const r = computeHealthScore({ ...BASE, lastHistoryStatus: 'FAILED', hasCostOrFloor: false });
    expect(r.status).toBe('PUSH_FAILING');
  });

  it('NEEDS_SETUP takes priority over NO_MARKET_DATA', () => {
    const r = computeHealthScore({ ...BASE, hasCostOrFloor: false, lastRepricedAt: null });
    expect(r.status).toBe('NEEDS_SETUP');
  });

  it('NEEDS_SETUP takes priority over RISKY_SETTINGS', () => {
    const r = computeHealthScore({ ...BASE, hasSku: false, minRoi: 80 });
    expect(r.status).toBe('NEEDS_SETUP');
  });

  it('all statuses have non-empty label and summary', () => {
    const cases: HealthScoreInput[] = [
      { ...BASE, lastHistoryStatus: 'FAILED' },
      { ...BASE, hasCostOrFloor: false },
      { ...BASE, lastRepricedAt: null },
      { ...BASE, lastRepricedAt: new Date(Date.now() - 20 * 86_400_000) },
      { ...BASE, minRoi: 80 },
      { ...BASE, lastRepricedAt: new Date(Date.now() - 10 * 86_400_000) },
      BASE,
    ];
    for (const c of cases) {
      const r = computeHealthScore(c);
      expect(r.label).toBeTruthy();
      expect(r.summary).toBeTruthy();
    }
  });
});

// ── computeRiskFactors ────────────────────────────────────────────────────────

describe('computeRiskFactors', () => {
  const BASE: RiskFactorInput = {
    direction:        'DOWN',
    previousPrice:    25.00,
    recommendedPrice: 24.00,
    estimatedFloor:   20.00,
    buyBoxPrice:      24.50,
    dataAgeHours:     2,
    hasCostBasis:     true,
    riskScore:        40,
    reason:           'Competing at 0.5% below buy box',
  };

  it('returns no factors for a typical safe fresh proposal', () => {
    const r = computeRiskFactors(BASE);
    expect(r).not.toContain('large_price_drop');
    expect(r).not.toContain('stale_market_data');
    expect(r).not.toContain('missing_buy_box');
    expect(r).not.toContain('missing_cost_basis');
    expect(r).not.toContain('high_fba_competition');
    expect(r).not.toContain('near_floor');
  });

  it('large_price_drop when price drops more than 15%', () => {
    const r = computeRiskFactors({ ...BASE, recommendedPrice: 20.00 }); // 20% drop
    expect(r).toContain('large_price_drop');
  });

  it('no large_price_drop when drop is exactly 15% or less', () => {
    const r = computeRiskFactors({ ...BASE, recommendedPrice: 21.25 }); // 15% drop
    expect(r).not.toContain('large_price_drop');
  });

  it('large_price_rise when UP direction and rise > 25%', () => {
    const r = computeRiskFactors({ ...BASE, direction: 'UP', previousPrice: 20.00, recommendedPrice: 26.00 }); // 30% rise
    expect(r).toContain('large_price_rise');
  });

  it('no large_price_rise for UP direction within 25%', () => {
    const r = computeRiskFactors({ ...BASE, direction: 'UP', previousPrice: 20.00, recommendedPrice: 24.00 }); // 20% rise
    expect(r).not.toContain('large_price_rise');
  });

  it('near_floor when recommended is within 5% of floor', () => {
    // $20.50 recommended, $20.00 floor = 2.4% above floor
    const r = computeRiskFactors({ ...BASE, recommendedPrice: 20.50, estimatedFloor: 20.00 });
    expect(r).toContain('near_floor');
  });

  it('no near_floor when recommended is well above floor', () => {
    const r = computeRiskFactors({ ...BASE, recommendedPrice: 24.00, estimatedFloor: 20.00 }); // 17% above floor
    expect(r).not.toContain('near_floor');
  });

  it('high_fba_competition when reason mentions competition', () => {
    const r = computeRiskFactors({ ...BASE, reason: 'High competition — holding price to avoid price war', riskScore: 70 });
    expect(r).toContain('high_fba_competition');
  });

  it('high_fba_competition fallback to riskScore >= 65 when reason is null', () => {
    const r = computeRiskFactors({ ...BASE, reason: null, riskScore: 70 });
    expect(r).toContain('high_fba_competition');
  });

  it('no high_fba_competition when riskScore < 65 and no reason', () => {
    const r = computeRiskFactors({ ...BASE, reason: null, riskScore: 40 });
    expect(r).not.toContain('high_fba_competition');
  });

  it('missing_buy_box when buyBoxPrice is null', () => {
    const r = computeRiskFactors({ ...BASE, buyBoxPrice: null });
    expect(r).toContain('missing_buy_box');
  });

  it('missing_buy_box when buyBoxPrice is zero', () => {
    const r = computeRiskFactors({ ...BASE, buyBoxPrice: 0 });
    expect(r).toContain('missing_buy_box');
  });

  it('stale_market_data when dataAgeHours >= 48', () => {
    const r = computeRiskFactors({ ...BASE, dataAgeHours: 48 });
    expect(r).toContain('stale_market_data');
  });

  it('no stale_market_data when dataAgeHours < 48', () => {
    const r = computeRiskFactors({ ...BASE, dataAgeHours: 47 });
    expect(r).not.toContain('stale_market_data');
  });

  it('floor_bound when reason mentions floor and holding', () => {
    const r = computeRiskFactors({
      ...BASE,
      reason: 'Buy box below your floor — holding at 30% ROI floor',
    });
    expect(r).toContain('floor_bound');
  });

  it('floor_bound when reason mentions floor and protected', () => {
    const r = computeRiskFactors({ ...BASE, reason: 'Price protected at manual floor $22.00' });
    expect(r).toContain('floor_bound');
  });

  it('no floor_bound for FLOOR strategy (intentional, not constrained)', () => {
    const r = computeRiskFactors({ ...BASE, reason: 'Pricing at manual floor $22.00' });
    expect(r).not.toContain('floor_bound');
  });

  it('missing_cost_basis when hasCostBasis is false', () => {
    const r = computeRiskFactors({ ...BASE, hasCostBasis: false });
    expect(r).toContain('missing_cost_basis');
  });

  it('can accumulate multiple factors simultaneously', () => {
    const r = computeRiskFactors({
      ...BASE,
      recommendedPrice: 18.00, // large drop + near floor
      estimatedFloor:   17.50,
      dataAgeHours:     72,    // stale
      buyBoxPrice:      null,  // missing buy box
      hasCostBasis:     false, // missing cost
    });
    expect(r.length).toBeGreaterThanOrEqual(3);
    expect(r).toContain('stale_market_data');
    expect(r).toContain('missing_buy_box');
    expect(r).toContain('missing_cost_basis');
  });
});

// ── riskScoreToLevel ──────────────────────────────────────────────────────────

describe('riskScoreToLevel', () => {
  it('returns low for score < 30', () => {
    expect(riskScoreToLevel(0)).toBe('low');
    expect(riskScoreToLevel(20)).toBe('low');
    expect(riskScoreToLevel(29)).toBe('low');
  });

  it('returns medium for score 30–54', () => {
    expect(riskScoreToLevel(30)).toBe('medium');
    expect(riskScoreToLevel(40)).toBe('medium');
    expect(riskScoreToLevel(54)).toBe('medium');
  });

  it('returns high for score 55–74', () => {
    expect(riskScoreToLevel(55)).toBe('high');
    expect(riskScoreToLevel(65)).toBe('high');
    expect(riskScoreToLevel(74)).toBe('high');
  });

  it('returns very_high for score >= 75', () => {
    expect(riskScoreToLevel(75)).toBe('very_high');
    expect(riskScoreToLevel(80)).toBe('very_high');
    expect(riskScoreToLevel(100)).toBe('very_high');
  });

  it('boundaries are exact: 29→low, 30→medium; 54→medium, 55→high; 74→high, 75→very_high', () => {
    expect(riskScoreToLevel(29)).toBe('low');
    expect(riskScoreToLevel(30)).toBe('medium');
    expect(riskScoreToLevel(54)).toBe('medium');
    expect(riskScoreToLevel(55)).toBe('high');
    expect(riskScoreToLevel(74)).toBe('high');
    expect(riskScoreToLevel(75)).toBe('very_high');
  });
});
