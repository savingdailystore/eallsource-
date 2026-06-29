import { describe, it, expect } from 'vitest';
import { buildRiskBreakdown } from './riskPresentation';
import type { RiskPresentationInput } from '@/types';

function baseInput(overrides: Partial<RiskPresentationInput> = {}): RiskPresentationInput {
  return {
    priceStability: 'STABLE',
    priceTrend: 'FLAT',
    totalSellers: 2,
    amazonIsSeller: false,
    buyBoxSuppressed: false,
    ipRiskScore: 'LOW',
    isPrivateLabel: false,
    isBrandRestricted: false,
    isGenericBrand: false,
    hasHazmat: false,
    isMeltable: false,
    ...overrides,
  };
}

describe('buildRiskBreakdown', () => {
  it('rates a clean listing as overall low risk', () => {
    const result = buildRiskBreakdown(baseInput());
    // IP defaults to LOW (not VERY_LOW) — "no known restriction" isn't the
    // same certainty as the other categories' explicit clean signals.
    expect(result.overall).toBe('LOW');
    expect(result.categories).toHaveLength(5);
  });

  it('flags Amazon risk HIGH when Amazon holds the Buy Box', () => {
    const result = buildRiskBreakdown(baseInput({ amazonIsSeller: true, buyBoxSuppressed: false }));
    const amazon = result.categories.find((c) => c.category === 'Amazon')!;
    expect(amazon.level).toBe('HIGH');
    expect(result.overall).toBe('HIGH');
  });

  it('flags IP risk HIGH for private label and explains why', () => {
    const result = buildRiskBreakdown(baseInput({ isPrivateLabel: true }));
    const ip = result.categories.find((c) => c.category === 'IP')!;
    expect(ip.level).toBe('HIGH');
    expect(ip.reason).toMatch(/private-label/i);
  });

  it('flags Storage risk HIGH for hazmat items', () => {
    const result = buildRiskBreakdown(baseInput({ hasHazmat: true }));
    const storage = result.categories.find((c) => c.category === 'Storage')!;
    expect(storage.level).toBe('HIGH');
  });

  it('flags Pricing risk HIGH for volatile prices, regardless of trend', () => {
    const result = buildRiskBreakdown(baseInput({ priceStability: 'VOLATILE' }));
    const pricing = result.categories.find((c) => c.category === 'Pricing')!;
    expect(pricing.level).toBe('HIGH');
  });

  it('scales competition risk with seller count', () => {
    expect(buildRiskBreakdown(baseInput({ totalSellers: 1 })).categories.find((c) => c.category === 'Competition')!.level).toBe('VERY_LOW');
    expect(buildRiskBreakdown(baseInput({ totalSellers: 15 })).categories.find((c) => c.category === 'Competition')!.level).toBe('HIGH');
  });

  it('overall risk is the max severity across categories, not an average', () => {
    const result = buildRiskBreakdown(baseInput({ totalSellers: 1, hasHazmat: true }));
    expect(result.overall).toBe('HIGH'); // hazmat alone should dominate despite low competition risk
  });
});
