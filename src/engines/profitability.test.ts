import { describe, it, expect } from 'vitest';
import { calculateProfitability } from './profitability';

// ─── Shared baseline inputs ────────────────────────────────────────────────────
// sourcePrice=$10, resellPrice=$25, no discounts/shipping, default FBA/referral
const BASE = {
  sourcePrice: 10,
  discounts:   [] as never[],
  resellPrice: 25,
  category:    'Home & Kitchen',
} as const;

// ─── 1. Default (omitted taxRate) matches legacy 8.75% behavior ───────────────

describe('calculateProfitability — default taxRate (omitted)', () => {
  it('produces same taxAmount as explicit 0.0875', () => {
    const withDefault  = calculateProfitability({ ...BASE });
    const withExplicit = calculateProfitability({ ...BASE, taxRate: 0.0875 });
    expect(withDefault.taxAmount).toBeCloseTo(withExplicit.taxAmount, 6);
  });

  it('produces same profit as explicit 0.0875', () => {
    const withDefault  = calculateProfitability({ ...BASE });
    const withExplicit = calculateProfitability({ ...BASE, taxRate: 0.0875 });
    expect(withDefault.profit).toBeCloseTo(withExplicit.profit, 6);
  });

  it('taxAmount equals finalCost * 0.0875', () => {
    const r = calculateProfitability({ ...BASE });
    expect(r.taxAmount).toBeCloseTo(10 * 0.0875, 6);
  });
});

// ─── 2. Explicit taxRate: 0.0875 matches baseline ─────────────────────────────

describe('calculateProfitability — explicit taxRate: 0.0875', () => {
  it('profit matches omitted-taxRate result', () => {
    const a = calculateProfitability({ ...BASE });
    const b = calculateProfitability({ ...BASE, taxRate: 0.0875 });
    expect(b.profit).toBeCloseTo(a.profit, 6);
  });
});

// ─── 3. taxRate: 0 produces higher profit by exactly the old taxAmount ─────────

describe('calculateProfitability — taxRate: 0 (tax-exempt)', () => {
  it('taxAmount is 0', () => {
    const r = calculateProfitability({ ...BASE, taxRate: 0 });
    expect(r.taxAmount).toBe(0);
  });

  it('profit is higher by exactly the 8.75% tax amount', () => {
    const taxed   = calculateProfitability({ ...BASE, taxRate: 0.0875 });
    const exempt  = calculateProfitability({ ...BASE, taxRate: 0 });
    expect(exempt.profit).toBeCloseTo(taxed.profit + taxed.taxAmount, 6);
  });
});

// ─── 4. taxRate: 0.10 applies 10% ─────────────────────────────────────────────

describe('calculateProfitability — taxRate: 0.10', () => {
  it('taxAmount equals finalCost * 0.10', () => {
    const r = calculateProfitability({ ...BASE, taxRate: 0.10 });
    expect(r.taxAmount).toBeCloseTo(10 * 0.10, 6);
  });

  it('profit is lower than at 0.0875 by the difference in tax', () => {
    const a = calculateProfitability({ ...BASE, taxRate: 0.0875 });
    const b = calculateProfitability({ ...BASE, taxRate: 0.10 });
    const taxDiff = 10 * (0.10 - 0.0875);
    expect(a.profit - b.profit).toBeCloseTo(taxDiff, 6);
  });
});

// ─── 5. Tax is counted exactly once ───────────────────────────────────────────

describe('calculateProfitability — tax counted exactly once', () => {
  it('profit = resellPrice - fees - totalLandedCost (no double-count)', () => {
    const r = calculateProfitability({ ...BASE, taxRate: 0.0875 });
    // fees includes taxAmount; totalLandedCost does NOT include tax
    const reconstructed = r.resellPrice - (r.amazonFees + r.prepFee + r.taxAmount) - r.totalLandedCost;
    expect(r.profit).toBeCloseTo(reconstructed, 6);
  });

  it('totalLandedCost does not include a tax component', () => {
    // totalLandedCost = finalCost + sourceShipping (no tax)
    const r = calculateProfitability({ ...BASE, taxRate: 0.0875, sourceShipping: 2 });
    expect(r.totalLandedCost).toBeCloseTo(r.finalCost + 2, 6);
    // taxAmount is separate (in fees), not in totalLandedCost
    expect(r.totalLandedCost).not.toBeCloseTo(r.finalCost + r.taxAmount + 2, 6);
  });

  it('passing taxRate: 0 still has no tax in totalLandedCost', () => {
    const r = calculateProfitability({ ...BASE, taxRate: 0 });
    expect(r.totalLandedCost).toBeCloseTo(r.finalCost, 6);
  });
});

// ─── 6. No sourceTax dollar-amount input — tax comes only from taxRate ────────

describe('calculateProfitability — tax source is taxRate only', () => {
  it('taxAmount scales linearly with taxRate', () => {
    const r1 = calculateProfitability({ ...BASE, taxRate: 0.05 });
    const r2 = calculateProfitability({ ...BASE, taxRate: 0.10 });
    // doubling the rate doubles the tax dollar amount
    expect(r2.taxAmount).toBeCloseTo(r1.taxAmount * 2, 6);
  });

  it('two calls with same taxRate always produce the same taxAmount', () => {
    const a = calculateProfitability({ ...BASE, taxRate: 0.0875 });
    const b = calculateProfitability({ ...BASE, taxRate: 0.0875 });
    expect(a.taxAmount).toBe(b.taxAmount);
    expect(a.profit).toBe(b.profit);
  });
});

// ─── 7. STARTER_SALES-style: after-tax profit is used for the $1 floor ────────

describe('calculateProfitability — profit used for STARTER_SALES floor', () => {
  it('profit already reflects source tax so callers can compare directly to $1 floor', () => {
    // sourcePrice=$12.95, resellPrice=$20.95 (West Paw scenario)
    const r = calculateProfitability({
      sourcePrice: 12.95,
      taxRate:     0.0875,
      discounts:   [],
      resellPrice: 20.95,
      category:    'Pet Supplies',
      // use default fees
    });
    // Tax is already deducted from profit — the $1 floor is a post-tax comparison
    expect(r.profit).toBeLessThan(1);   // West Paw is unprofitable after tax
    expect(r.taxAmount).toBeCloseTo(12.95 * 0.0875, 4);
  });
});

// ─── 8. Return values are finite and self-consistent ──────────────────────────

describe('calculateProfitability — output shape', () => {
  it('returns all required fields', () => {
    const r = calculateProfitability({ ...BASE });
    expect(r).toHaveProperty('finalCost');
    expect(r).toHaveProperty('totalLandedCost');
    expect(r).toHaveProperty('taxAmount');
    expect(r).toHaveProperty('profit');
    expect(r).toHaveProperty('roi');
    expect(r).toHaveProperty('margin');
    expect(r).toHaveProperty('qualifies');
    expect(r).toHaveProperty('feeEstimateConfirmed');
  });

  it('all numeric outputs are finite', () => {
    const r = calculateProfitability({ ...BASE });
    expect(Number.isFinite(r.profit)).toBe(true);
    expect(Number.isFinite(r.roi)).toBe(true);
    expect(Number.isFinite(r.taxAmount)).toBe(true);
    expect(Number.isFinite(r.totalLandedCost)).toBe(true);
  });
});
