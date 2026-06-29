import { describe, it, expect } from 'vitest';
import { amazonPresence, amazonTransitions, buyBoxStableStreakDays, bsrTrendPct } from './keepaHistoryMetrics';
import type { KeepaHistorySnapshot, KeepaSeries } from '@/lib/keepa';

const DAY = 24 * 60 * 60 * 1000;
const empty: KeepaSeries = { t: [], v: [] };

function snapshot(overrides: Partial<KeepaHistorySnapshot>): KeepaHistorySnapshot {
  return {
    fetchedAt: new Date().toISOString(),
    windowDays: 400,
    amazonPrice: empty,
    newPrice: empty,
    salesRank: empty,
    buyBoxPrice: empty,
    ...overrides,
  };
}

describe('amazonPresence', () => {
  it('returns undefined with too few points to support a claim', () => {
    const snap = snapshot({ amazonPrice: { t: [0, DAY], v: [10, null] } });
    expect(amazonPresence(snap)).toBeUndefined();
  });

  it('computes absent/present percentages from real points', () => {
    const t = Array.from({ length: 10 }, (_, i) => i * DAY);
    const v = [10, 10, null, null, null, null, null, null, 10, 10]; // 4/10 present
    const snap = snapshot({ amazonPrice: { t, v } });
    const result = amazonPresence(snap)!;
    expect(result.presentPct).toBe(40);
    expect(result.absentPct).toBe(60);
    expect(result.pointCount).toBe(10);
  });
});

describe('amazonTransitions', () => {
  it('emits an event only on a real presence flip, not every point', () => {
    const t = [0, DAY, 2 * DAY, 3 * DAY, 4 * DAY];
    const v = [10, 10, null, null, 12]; // present -> absent -> present
    const snap = snapshot({ amazonPrice: { t, v } });
    const events = amazonTransitions(snap);
    expect(events).toEqual([
      { at: 2 * DAY, type: 'EXITED' },
      { at: 4 * DAY, type: 'ENTERED' },
    ]);
  });

  it('returns no events for a constant series', () => {
    const snap = snapshot({ amazonPrice: { t: [0, DAY], v: [10, 11] } });
    expect(amazonTransitions(snap)).toEqual([]);
  });
});

describe('buyBoxStableStreakDays', () => {
  it('returns undefined with too few points', () => {
    const snap = snapshot({ buyBoxPrice: { t: [0, DAY], v: [10, 10] } });
    expect(buyBoxStableStreakDays(snap)).toBeUndefined();
  });

  it('measures the trailing stable streak in days for a flat price', () => {
    const t = Array.from({ length: 10 }, (_, i) => i * DAY);
    const v = Array.from({ length: 10 }, () => 19.99);
    const snap = snapshot({ buyBoxPrice: { t, v } });
    expect(buyBoxStableStreakDays(snap)).toBe(9 * 1); // span from first to last point
  });
});

describe('bsrTrendPct', () => {
  it('returns undefined with too few points', () => {
    const snap = snapshot({ salesRank: { t: [0], v: [1000] } });
    expect(bsrTrendPct(snap)).toBeUndefined();
  });

  it('reports a signed percentage for a clear trend', () => {
    const ranks = [...Array(6).fill(10000), ...Array(6).fill(10000), ...Array(6).fill(2000)];
    const t = ranks.map((_, i) => i * DAY);
    const snap = snapshot({ salesRank: { t, v: ranks } });
    const pct = bsrTrendPct(snap);
    expect(pct).toBeLessThan(0); // BSR dropped (improved) — reported as a negative number
  });
});
