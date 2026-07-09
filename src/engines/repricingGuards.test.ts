import { describe, it, expect } from 'vitest';
import { detectSkuMismatch, detectCostMismatch, COST_MISMATCH_THRESHOLD } from './repricingGuards';

// ── detectSkuMismatch ──────────────────────────────────────────────────────────

describe('detectSkuMismatch', () => {
  it('returns false when both SKUs match exactly', () => {
    expect(detectSkuMismatch('A00-G06-1.75', 'A00-G06-1.75')).toBe(false);
  });

  it('returns true when inventory SKU differs from history SKU', () => {
    expect(detectSkuMismatch('A00-G06-1.75-1000-SPLFREE-US2', 'A00-K00-1.75-1000-SPL-US2')).toBe(true);
  });

  it('returns false when inventory SKU is null — cannot warn without both sides', () => {
    expect(detectSkuMismatch(null, 'A00-K00-1.75-1000-SPL-US2')).toBe(false);
  });

  it('returns false when inventory SKU is undefined', () => {
    expect(detectSkuMismatch(undefined, 'A00-K00')).toBe(false);
  });

  it('returns false when history SKU is null — cannot warn without both sides', () => {
    expect(detectSkuMismatch('A00-G06-1.75', null)).toBe(false);
  });

  it('returns false when history SKU is undefined', () => {
    expect(detectSkuMismatch('A00-G06', undefined)).toBe(false);
  });

  it('returns false when both SKUs are null', () => {
    expect(detectSkuMismatch(null, null)).toBe(false);
  });
});

// ── detectCostMismatch ─────────────────────────────────────────────────────────

describe('detectCostMismatch', () => {
  it('returns false when costs match exactly', () => {
    expect(detectCostMismatch(10.89, 10.89)).toBe(false);
  });

  it('returns false when difference is below the threshold', () => {
    // 10.89 vs 12.09: |10.89 - 12.09| / 12.09 ≈ 9.9% — below 20%
    expect(detectCostMismatch(10.89, 12.09)).toBe(false);
  });

  it('returns true when difference exceeds the threshold', () => {
    // 10.89 vs 14.94: |10.89 - 14.94| / 14.94 ≈ 27.1% — above 20%
    expect(detectCostMismatch(10.89, 14.94)).toBe(true);
  });

  it('returns true when costBasis is dramatically lower than inventory cost', () => {
    expect(detectCostMismatch(5.00, 15.00)).toBe(true); // 66% diff
  });

  it('returns false when costBasis is null', () => {
    expect(detectCostMismatch(null, 12.09)).toBe(false);
  });

  it('returns false when inventory cost is null', () => {
    expect(detectCostMismatch(10.89, null)).toBe(false);
  });

  it('returns false when costBasis is 0 (not a valid cost)', () => {
    expect(detectCostMismatch(0, 12.09)).toBe(false);
  });

  it('returns false when inventory cost is 0 (not a valid cost)', () => {
    expect(detectCostMismatch(10.89, 0)).toBe(false);
  });

  it('uses COST_MISMATCH_THRESHOLD for the boundary', () => {
    // Exactly at the boundary (20%) should return false — threshold is strictly >
    const inventoryCost = 100;
    const atBoundary = inventoryCost * (1 - COST_MISMATCH_THRESHOLD); // 80 → diff = 20%
    expect(detectCostMismatch(atBoundary, inventoryCost)).toBe(false);
    const overBoundary = inventoryCost * (1 - COST_MISMATCH_THRESHOLD) - 0.01; // just over
    expect(detectCostMismatch(overBoundary, inventoryCost)).toBe(true);
  });
});
