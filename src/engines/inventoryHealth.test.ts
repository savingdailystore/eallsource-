import { describe, it, expect } from 'vitest';
import {
  evaluateInventoryHealth,
  computeRestockSignal,
  getAgingBucket,
  daysBetween,
  type InventoryHealthInput,
  type InventoryProductSnapshot,
} from './inventoryHealth';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

const HEALTHY_PRODUCT: InventoryProductSnapshot = {
  roi:                   45,
  profit:                12,
  price:                 35,
  demandLevel:           'HIGH',
  monthlySales:          200,
  fbaSellers:            3,
  totalSellers:          5,
  amazonIsSeller:        false,
  amazonOwnsBuyBox:      false,
  buyBoxSuppressed:      false,
  gatingRisk:            'LOW',
  hasIpComplaintHistory: false,
  isBrandRestricted:     false,
  priceTrend:            'FLAT',
  priceStability:        'STABLE',
  score:                 82,
  bsr:                   15000,
};

function baseInput(overrides: Partial<InventoryHealthInput> = {}): InventoryHealthInput {
  return {
    availableQuantity: 20,
    reservedQuantity:  2,
    inboundQuantity:   0,
    totalQuantity:     22,
    createdAt:         daysAgo(10),
    product:           { ...HEALTHY_PRODUCT },
    ...overrides,
  };
}

// ─── Health status tests ────────────────────────────────────────────────────

describe('evaluateInventoryHealth — status', () => {
  it('returns UNKNOWN when no product is linked', () => {
    const result = evaluateInventoryHealth(baseInput({ product: undefined }));
    expect(result.status).toBe('UNKNOWN');
    expect(result.restockSignal).toBe('UNKNOWN');
    expect(result.profitSummary).toBeNull();
    expect(result.demandSummary).toBeNull();
    expect(result.riskFactors).toHaveLength(0);
  });

  it('returns AT_RISK when IP complaint history is present', () => {
    const result = evaluateInventoryHealth(baseInput({
      product: { ...HEALTHY_PRODUCT, hasIpComplaintHistory: true },
    }));
    expect(result.status).toBe('AT_RISK');
    expect(result.reasons.some(r => r.toLowerCase().includes('ip complaint'))).toBe(true);
  });

  it('returns AT_RISK when brand is restricted with HIGH gating risk', () => {
    const result = evaluateInventoryHealth(baseInput({
      product: { ...HEALTHY_PRODUCT, gatingRisk: 'HIGH', isBrandRestricted: true },
    }));
    expect(result.status).toBe('AT_RISK');
    expect(result.reasons.some(r => r.toLowerCase().includes('brand'))).toBe(true);
  });

  it('returns AT_RISK when buy box is suppressed by Amazon', () => {
    const result = evaluateInventoryHealth(baseInput({
      product: { ...HEALTHY_PRODUCT, buyBoxSuppressed: true, amazonOwnsBuyBox: true },
    }));
    expect(result.status).toBe('AT_RISK');
    expect(result.reasons.some(r => r.toLowerCase().includes('buy box'))).toBe(true);
  });

  it('does NOT return AT_RISK when only buyBoxSuppressed but Amazon does not own it', () => {
    const result = evaluateInventoryHealth(baseInput({
      product: { ...HEALTHY_PRODUCT, buyBoxSuppressed: true, amazonOwnsBuyBox: false },
    }));
    expect(result.status).not.toBe('AT_RISK');
  });

  it('returns LOW_MARGIN when ROI is below threshold', () => {
    const result = evaluateInventoryHealth(baseInput({
      product: { ...HEALTHY_PRODUCT, roi: 10, profit: 5 },
    }));
    expect(result.status).toBe('LOW_MARGIN');
    expect(result.reasons.some(r => r.includes('ROI'))).toBe(true);
  });

  it('returns LOW_MARGIN when profit is below $3 floor', () => {
    const result = evaluateInventoryHealth(baseInput({
      product: { ...HEALTHY_PRODUCT, roi: 18, profit: 2 },
    }));
    expect(result.status).toBe('LOW_MARGIN');
    expect(result.reasons.some(r => r.includes('$2.00'))).toBe(true);
  });

  it('returns REORDER_SOON when stock is low with good metrics', () => {
    const result = evaluateInventoryHealth(baseInput({
      availableQuantity: 2,
      inboundQuantity:   0,
      product:           { ...HEALTHY_PRODUCT, roi: 45, demandLevel: 'HIGH' },
    }));
    expect(result.status).toBe('REORDER_SOON');
    expect(result.reasons.some(r => r.includes('2 units'))).toBe(true);
  });

  it('does NOT return REORDER_SOON when inbound stock is coming', () => {
    const result = evaluateInventoryHealth(baseInput({
      availableQuantity: 2,
      inboundQuantity:   10,
      product:           { ...HEALTHY_PRODUCT, roi: 45, demandLevel: 'HIGH' },
    }));
    expect(result.status).not.toBe('REORDER_SOON');
  });

  it('does NOT return REORDER_SOON when ROI is below floor', () => {
    const result = evaluateInventoryHealth(baseInput({
      availableQuantity: 2,
      inboundQuantity:   0,
      product:           { ...HEALTHY_PRODUCT, roi: 16, profit: 5, demandLevel: 'HIGH' },
    }));
    expect(result.status).not.toBe('REORDER_SOON');
  });

  it('returns OVERSTOCKED when many units with LOW demand', () => {
    const result = evaluateInventoryHealth(baseInput({
      availableQuantity: 50,
      product:           { ...HEALTHY_PRODUCT, demandLevel: 'LOW', roi: 30, profit: 8 },
    }));
    expect(result.status).toBe('OVERSTOCKED');
    expect(result.reasons.some(r => r.includes('50 units'))).toBe(true);
  });

  it('does NOT return OVERSTOCKED when demand is MEDIUM', () => {
    const result = evaluateInventoryHealth(baseInput({
      availableQuantity: 50,
      product:           { ...HEALTHY_PRODUCT, demandLevel: 'MEDIUM', roi: 30, profit: 8 },
    }));
    expect(result.status).not.toBe('OVERSTOCKED');
  });

  it('returns AGING when tracked over 90 days with units still available', () => {
    const result = evaluateInventoryHealth(baseInput({
      availableQuantity: 5,
      createdAt:         daysAgo(100),
    }));
    expect(result.status).toBe('AGING');
    expect(result.daysSinceTracked).toBeGreaterThan(90);
  });

  it('does NOT return AGING when zero units available', () => {
    const result = evaluateInventoryHealth(baseInput({
      availableQuantity: 0,
      createdAt:         daysAgo(100),
    }));
    // Zero available with good metrics — HEALTHY or REORDER_SOON depending on inbound
    expect(result.status).not.toBe('AGING');
  });

  it('returns HEALTHY when all metrics are good', () => {
    const result = evaluateInventoryHealth(baseInput());
    expect(result.status).toBe('HEALTHY');
    expect(result.profitSummary).not.toBeNull();
    expect(result.demandSummary).not.toBeNull();
  });

  it('AT_RISK takes priority over LOW_MARGIN', () => {
    const result = evaluateInventoryHealth(baseInput({
      product: { ...HEALTHY_PRODUCT, hasIpComplaintHistory: true, roi: 5, profit: 1 },
    }));
    expect(result.status).toBe('AT_RISK');
  });

  it('LOW_MARGIN takes priority over AGING', () => {
    const result = evaluateInventoryHealth(baseInput({
      availableQuantity: 5,
      createdAt:         daysAgo(120),
      product:           { ...HEALTHY_PRODUCT, roi: 10, profit: 2 },
    }));
    expect(result.status).toBe('LOW_MARGIN');
  });
});

// ─── Restock signal tests ───────────────────────────────────────────────────

describe('computeRestockSignal', () => {
  it('returns UNKNOWN when no product', () => {
    expect(computeRestockSignal(0, 0, undefined)).toBe('UNKNOWN');
  });

  it('returns DO_NOT_REORDER when IP complaint history', () => {
    expect(computeRestockSignal(5, 0, { ...HEALTHY_PRODUCT, hasIpComplaintHistory: true }))
      .toBe('DO_NOT_REORDER');
  });

  it('returns DO_NOT_REORDER when ROI is very low', () => {
    expect(computeRestockSignal(5, 0, { ...HEALTHY_PRODUCT, roi: 8, profit: 2 }))
      .toBe('DO_NOT_REORDER');
  });

  it('returns DO_NOT_REORDER when demand is LOW', () => {
    expect(computeRestockSignal(5, 0, { ...HEALTHY_PRODUCT, demandLevel: 'LOW' }))
      .toBe('DO_NOT_REORDER');
  });

  it('returns REORDER_NOW when qty=0, nothing inbound, good metrics', () => {
    expect(computeRestockSignal(0, 0, HEALTHY_PRODUCT)).toBe('REORDER_NOW');
  });

  it('returns REORDER_SOON when qty<=3, nothing inbound, good metrics', () => {
    expect(computeRestockSignal(3, 0, HEALTHY_PRODUCT)).toBe('REORDER_SOON');
  });

  it('returns HOLD when qty=0 but inbound stock is coming', () => {
    expect(computeRestockSignal(0, 10, HEALTHY_PRODUCT)).toBe('HOLD');
  });

  it('returns HOLD for healthy item with adequate stock', () => {
    expect(computeRestockSignal(20, 0, HEALTHY_PRODUCT)).toBe('HOLD');
  });
});

// ─── Aging bucket tests ─────────────────────────────────────────────────────

describe('getAgingBucket', () => {
  it('0 days → 0-30', () => expect(getAgingBucket(0)).toBe('0-30'));
  it('30 days → 0-30', () => expect(getAgingBucket(30)).toBe('0-30'));
  it('31 days → 31-60', () => expect(getAgingBucket(31)).toBe('31-60'));
  it('60 days → 31-60', () => expect(getAgingBucket(60)).toBe('31-60'));
  it('61 days → 61-90', () => expect(getAgingBucket(61)).toBe('61-90'));
  it('90 days → 61-90', () => expect(getAgingBucket(90)).toBe('61-90'));
  it('91 days → 90+', () => expect(getAgingBucket(91)).toBe('90+'));
  it('500 days → 90+', () => expect(getAgingBucket(500)).toBe('90+'));
});

// ─── daysBetween utility ────────────────────────────────────────────────────

describe('daysBetween', () => {
  it('returns 0 for same timestamp', () => {
    const d = new Date();
    expect(daysBetween(d, d)).toBe(0);
  });

  it('returns correct day count', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to   = new Date('2026-01-11T00:00:00Z');
    expect(daysBetween(from, to)).toBe(10);
  });
});

// ─── Data honesty: no fabrication ──────────────────────────────────────────

describe('data honesty — no fabricated metrics', () => {
  it('returns null profitSummary when no product', () => {
    const result = evaluateInventoryHealth(baseInput({ product: undefined }));
    expect(result.profitSummary).toBeNull();
  });

  it('returns null demandSummary when no product', () => {
    const result = evaluateInventoryHealth(baseInput({ product: undefined }));
    expect(result.demandSummary).toBeNull();
  });

  it('does not include costBasis in profitSummary when no repricing rule', () => {
    const result = evaluateInventoryHealth(baseInput({ repricing: undefined }));
    expect(result.profitSummary?.costBasis).toBeUndefined();
  });

  it('includes costBasis only when repricing rule provides it', () => {
    const result = evaluateInventoryHealth(baseInput({
      repricing: { costBasis: 15.99, isActive: true },
    }));
    expect(result.profitSummary?.costBasis).toBe(15.99);
  });

  it('UNKNOWN status has an honest recommendation pointing to scanner', () => {
    const result = evaluateInventoryHealth(baseInput({ product: undefined }));
    expect(result.recommendation.toLowerCase()).toContain('scanner');
  });

  it('UNKNOWN recommendation does not claim demand or ROI information', () => {
    const result = evaluateInventoryHealth(baseInput({ product: undefined }));
    expect(result.recommendation).not.toMatch(/\d+%/);
    expect(result.recommendation).not.toMatch(/demand/i);
  });

  it('AGING status uses "tracked for X days" language, not "purchased"', () => {
    const result = evaluateInventoryHealth(baseInput({
      availableQuantity: 5,
      createdAt:         daysAgo(100),
    }));
    expect(result.recommendation.toLowerCase()).toContain('tracked for');
    expect(result.recommendation.toLowerCase()).not.toContain('purchased');
    expect(result.recommendation.toLowerCase()).not.toContain('age');
  });

  it('AGING with purchasedAt uses "purchased X days ago" language', () => {
    const result = evaluateInventoryHealth(baseInput({
      availableQuantity: 5,
      createdAt:         daysAgo(5),   // recently tracked
      purchasedAt:       daysAgo(120), // but truly old
    }));
    expect(result.status).toBe('AGING');
    expect(result.recommendation.toLowerCase()).toContain('purchased');
    expect(result.recommendation.toLowerCase()).not.toContain('tracked for');
  });

  it('does not fabricate unitCost or inventoryValue when no cost data is available', () => {
    const result = evaluateInventoryHealth(baseInput({ repricing: undefined, unitCost: null }));
    expect(result.profitSummary?.unitCost).toBeUndefined();
    expect(result.profitSummary?.inventoryValue).toBeUndefined();
  });
});

// ─── Phase 2.1: purchasedAt aging source ───────────────────────────────────

describe('purchasedAt — aging source', () => {
  it('agingSource is "tracked" when purchasedAt is absent', () => {
    const result = evaluateInventoryHealth(baseInput({ createdAt: daysAgo(10) }));
    expect(result.agingSource).toBe('tracked');
    expect(result.agingDays).toBe(result.daysSinceTracked);
  });

  it('agingSource is "purchased" when purchasedAt is provided', () => {
    const result = evaluateInventoryHealth(baseInput({
      createdAt:   daysAgo(5),
      purchasedAt: daysAgo(30),
    }));
    expect(result.agingSource).toBe('purchased');
    expect(result.agingDays).toBeGreaterThanOrEqual(29);
  });

  it('agingDays uses purchasedAt, not createdAt, when purchasedAt is present', () => {
    const result = evaluateInventoryHealth(baseInput({
      createdAt:   daysAgo(5),    // short tracking window
      purchasedAt: daysAgo(120),  // long true age
    }));
    expect(result.agingDays).toBeGreaterThan(90);
    expect(result.daysSinceTracked).toBeLessThan(10);
  });

  it('AGING triggers on purchasedAt age, not createdAt, when purchasedAt is set', () => {
    const result = evaluateInventoryHealth(baseInput({
      availableQuantity: 5,
      createdAt:         daysAgo(5),   // recently added to system
      purchasedAt:       daysAgo(120), // but truly old purchase
    }));
    expect(result.status).toBe('AGING');
  });

  it('item recently tracked without purchasedAt does NOT become AGING', () => {
    const result = evaluateInventoryHealth(baseInput({
      availableQuantity: 5,
      createdAt:         daysAgo(5),
    }));
    expect(result.status).not.toBe('AGING');
  });

  it('AGING reason says "Purchased X days ago" when purchasedAt is set', () => {
    const result = evaluateInventoryHealth(baseInput({
      availableQuantity: 5,
      createdAt:         daysAgo(5),
      purchasedAt:       daysAgo(120),
    }));
    expect(result.reasons.some(r => r.toLowerCase().includes('purchased'))).toBe(true);
    expect(result.reasons.some(r => r.toLowerCase().includes('tracked for'))).toBe(false);
  });

  it('AGING reason says "Tracked for X days" when no purchasedAt', () => {
    const result = evaluateInventoryHealth(baseInput({
      availableQuantity: 5,
      createdAt:         daysAgo(100),
    }));
    expect(result.reasons.some(r => r.toLowerCase().includes('tracked for'))).toBe(true);
    expect(result.reasons.some(r => r.toLowerCase().includes('purchased'))).toBe(false);
  });

  it('null purchasedAt falls back to createdAt (same as absent)', () => {
    const tracked = evaluateInventoryHealth(baseInput({ createdAt: daysAgo(10) }));
    const withNull = evaluateInventoryHealth(baseInput({ createdAt: daysAgo(10), purchasedAt: null }));
    expect(withNull.agingSource).toBe('tracked');
    expect(withNull.agingDays).toBe(tracked.agingDays);
  });
});

// ─── Phase 2.1: unitCost and inventoryValue ─────────────────────────────────

describe('unitCost and inventoryValue', () => {
  it('resolves unitCost from item when provided', () => {
    const result = evaluateInventoryHealth(baseInput({ unitCost: 12.50 }));
    expect(result.profitSummary?.unitCost).toBe(12.50);
    expect(result.profitSummary?.unitCostSource).toBe('item');
  });

  it('resolves unitCost from repricing.costBasis when item unitCost is absent', () => {
    const result = evaluateInventoryHealth(baseInput({
      unitCost:  null,
      repricing: { costBasis: 9.99, isActive: true },
    }));
    expect(result.profitSummary?.unitCost).toBe(9.99);
    expect(result.profitSummary?.unitCostSource).toBe('repricing');
  });

  it('item unitCost takes priority over repricing.costBasis', () => {
    const result = evaluateInventoryHealth(baseInput({
      unitCost:  14.00,
      repricing: { costBasis: 9.99, isActive: true },
    }));
    expect(result.profitSummary?.unitCost).toBe(14.00);
    expect(result.profitSummary?.unitCostSource).toBe('item');
  });

  it('inventoryValue = availableQuantity × resolvedUnitCost', () => {
    const result = evaluateInventoryHealth(baseInput({
      availableQuantity: 20,
      unitCost:          5.00,
    }));
    expect(result.profitSummary?.inventoryValue).toBe(100.00);
  });

  it('inventoryValue is undefined when no cost data', () => {
    const result = evaluateInventoryHealth(baseInput({ unitCost: null, repricing: undefined }));
    expect(result.profitSummary?.inventoryValue).toBeUndefined();
  });

  it('inventoryValue uses fallback costBasis when no item unitCost', () => {
    const result = evaluateInventoryHealth(baseInput({
      availableQuantity: 10,
      unitCost:          null,
      repricing:         { costBasis: 8.00, isActive: true },
    }));
    expect(result.profitSummary?.inventoryValue).toBe(80.00);
  });

  it('inventoryValue is 0 when availableQuantity is 0 but cost is known', () => {
    const result = evaluateInventoryHealth(baseInput({
      availableQuantity: 0,
      unitCost:          10.00,
    }));
    expect(result.profitSummary?.inventoryValue).toBe(0);
  });

  it('costBasis is still present for backward compat when repricing provides it', () => {
    const result = evaluateInventoryHealth(baseInput({
      repricing: { costBasis: 15.99, isActive: true },
    }));
    expect(result.profitSummary?.costBasis).toBe(15.99);
  });
});

// ─── Risk factors surfacing ─────────────────────────────────────────────────

describe('riskFactors', () => {
  it('surfaces Amazon-is-seller as a risk factor even on HEALTHY status', () => {
    const result = evaluateInventoryHealth(baseInput({
      product: { ...HEALTHY_PRODUCT, amazonIsSeller: true },
    }));
    expect(result.riskFactors.some(r => r.toLowerCase().includes('amazon'))).toBe(true);
  });

  it('surfaces declining price trend as a risk factor', () => {
    const result = evaluateInventoryHealth(baseInput({
      product: { ...HEALTHY_PRODUCT, priceTrend: 'DECLINING' },
    }));
    expect(result.riskFactors.some(r => r.toLowerCase().includes('declining'))).toBe(true);
  });

  it('returns empty riskFactors array for UNKNOWN status', () => {
    const result = evaluateInventoryHealth(baseInput({ product: undefined }));
    expect(result.riskFactors).toEqual([]);
  });
});
