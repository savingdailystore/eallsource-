import { describe, it, expect } from 'vitest';
import { buildHistoricalInsights } from './historicalInsights';
import type { KeepaHistorySnapshot } from '@/lib/keepa';

const DAY = 24 * 60 * 60 * 1000;

function snapshot(overrides: Partial<KeepaHistorySnapshot>): KeepaHistorySnapshot {
  return {
    fetchedAt: new Date().toISOString(),
    windowDays: 400,
    amazonPrice: { t: [], v: [] },
    newPrice: { t: [], v: [] },
    salesRank: { t: [], v: [] },
    buyBoxPrice: { t: [], v: [] },
    ...overrides,
  };
}

describe('buildHistoricalInsights', () => {
  it('returns no insights with no history', () => {
    expect(buildHistoricalInsights(null)).toEqual([]);
    expect(buildHistoricalInsights(undefined)).toEqual([]);
  });

  it('reports an improved sales rank when BSR has dropped', () => {
    const ranks = [...Array(6).fill(10000), ...Array(6).fill(10000), ...Array(6).fill(2000)];
    const t = ranks.map((_, i) => i * DAY);
    const insights = buildHistoricalInsights(snapshot({ salesRank: { t, v: ranks } }));
    expect(insights.some((i) => i.text.includes('improved'))).toBe(true);
  });

  it('reports Amazon absence percentage when real history supports it', () => {
    const t = Array.from({ length: 10 }, (_, i) => i * DAY);
    const v = [null, null, null, null, null, null, null, 10, 10, 10];
    const insights = buildHistoricalInsights(snapshot({ amazonPrice: { t, v } }));
    expect(insights.some((i) => i.text.includes('Amazon has been absent 70%'))).toBe(true);
  });

  it('never fabricates a competition/seller-count trend insight', () => {
    const insights = buildHistoricalInsights(snapshot({}));
    expect(insights.some((i) => /competitor|seller/i.test(i.text))).toBe(false);
  });

  it('omits the price-stability insight when there is not enough data', () => {
    const insights = buildHistoricalInsights(snapshot({ buyBoxPrice: { t: [0, DAY], v: [10, 10] } }));
    expect(insights.some((i) => i.text.includes('remained stable'))).toBe(false);
  });
});
