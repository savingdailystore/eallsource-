import { describe, it, expect } from 'vitest';
import { buildConfidence } from './confidence';
import type { ConfidenceInput } from '@/types';

function baseInput(overrides: Partial<ConfidenceInput> = {}): ConfidenceInput {
  return {
    score: 80,
    roi: 60,
    demandLevel: 'HIGH',
    gatingRisk: 'LOW',
    priceStability: 'STABLE',
    priceTrend: 'FLAT',
    totalSellers: 2,
    fbaSellers: 1,
    amazonIsSeller: false,
    buyBoxSuppressed: false,
    rating: 4.5,
    reviewCount: 100,
    lowReviews: false,
    monthlySales: 50,
    keepaHistory: null,
    ...overrides,
  };
}

describe('buildConfidence', () => {
  it('produces a high confidence, high star rating for a strong lead', () => {
    const result = buildConfidence(baseInput());
    expect(result.confidence).toBeGreaterThanOrEqual(75);
    expect(result.stars).toBeGreaterThanOrEqual(4);
    expect(['Excellent Buy', 'Strong Buy']).toContain(result.recommendation);
  });

  it('caps primaryReasons but keeps the full reasons list uncapped', () => {
    const result = buildConfidence(baseInput());
    expect(result.primaryReasons.length).toBeLessThanOrEqual(5);
    expect(result.reasons.length).toBeGreaterThanOrEqual(result.primaryReasons.length);
  });

  it('surfaces concerns for a weak, risky lead', () => {
    const result = buildConfidence(baseInput({
      score: 25,
      roi: 10,
      demandLevel: 'LOW',
      gatingRisk: 'HIGH',
      priceStability: 'VOLATILE',
      priceTrend: 'DECLINING',
      totalSellers: 15,
      amazonIsSeller: true,
      buyBoxSuppressed: true,
      rating: 3.0,
      reviewCount: 2,
      lowReviews: true,
    }));
    expect(result.confidence).toBeLessThan(50);
    expect(result.recommendation).toMatch(/Risky|Avoid/);
    expect(result.concerns.length).toBeGreaterThan(0);
  });

  it('does not claim an Amazon-absence reason without real history backing it', () => {
    const result = buildConfidence(baseInput({ amazonIsSeller: false, keepaHistory: null }));
    expect(result.reasons.some((r) => r.includes('Amazon rarely in stock'))).toBe(false);
  });

  it('claims Amazon-absence only when history actually shows it', () => {
    const t = Array.from({ length: 10 }, (_, i) => i);
    const v = [null, null, null, null, null, null, null, 10, 10, 10]; // 70% absent
    const history = {
      fetchedAt: new Date().toISOString(),
      windowDays: 400,
      amazonPrice: { t, v },
      newPrice: { t: [], v: [] },
      salesRank: { t: [], v: [] },
      buyBoxPrice: { t: [], v: [] },
    };
    const result = buildConfidence(baseInput({ keepaHistory: history as any }));
    expect(result.reasons.some((r) => r.includes('Amazon rarely in stock'))).toBe(true);
  });

  // ── Competition signal regression tests ──────────────────────────────────────
  // These guard the totalSellers signal path. Before the pipeline fix, SP-API
  // returned explicit 0 (not undefined) which overrode Keepa's real value via
  // ??, so every product was scored as "few sellers" regardless of real comp.

  it('emits "Healthy competition" when totalSellers <= 3', () => {
    const result = buildConfidence(baseInput({ totalSellers: 3 }));
    expect(result.reasons).toContain('Healthy competition (few active sellers)');
    expect(result.concerns.some(c => c.includes('competition'))).toBe(false);
  });

  it('emits no competition signal in the neutral 4–10 range', () => {
    const result = buildConfidence(baseInput({ totalSellers: 7 }));
    expect(result.reasons.some(r => r.includes('competition'))).toBe(false);
    expect(result.concerns.some(c => c.includes('competition'))).toBe(false);
  });

  it('emits competition concern when totalSellers > 10', () => {
    const result = buildConfidence(baseInput({ totalSellers: 11 }));
    expect(result.concerns).toContain('Higher than average seller competition');
    expect(result.reasons.some(r => r.includes('competition'))).toBe(false);
  });
});

// ── Pipeline seller-count merge guard (isolated) ─────────────────────────────
// pipeline.ts calls external services so cannot be imported in unit tests.
// This extracts and tests the merge guard logic in isolation to catch any
// future regressions in the SP-API 0 → Keepa fallthrough fix.

function mergeSellers(spValue: number | undefined, keepaValue: number | undefined): number {
  // Mirrors the exact expression in pipeline.ts:
  //   (sp?.totalSellers || null) ?? keepa?.totalSellers ?? 0
  return (spValue || null) ?? keepaValue ?? 0;
}

describe('pipeline seller-count merge guard', () => {
  it('uses Keepa value when SP-API returns explicit 0 (the core regression)', () => {
    expect(mergeSellers(0, 3)).toBe(3);
  });

  it('uses SP-API value when it is a genuine non-zero count', () => {
    expect(mergeSellers(5, 3)).toBe(5);
  });

  it('falls back to 0 when both sources are absent', () => {
    expect(mergeSellers(undefined, undefined)).toBe(0);
  });

  it('uses Keepa value when SP-API is undefined', () => {
    expect(mergeSellers(undefined, 7)).toBe(7);
  });

  it('returns 0 when SP-API is 0 and Keepa is also 0', () => {
    expect(mergeSellers(0, 0)).toBe(0);
  });
});
