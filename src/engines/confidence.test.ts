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
});
