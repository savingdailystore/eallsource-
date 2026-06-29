import { describe, it, expect } from 'vitest';
import { buildTimeline } from './timeline';
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

describe('buildTimeline', () => {
  it('returns an empty timeline when there is no history', () => {
    expect(buildTimeline(null)).toEqual([]);
    expect(buildTimeline(undefined)).toEqual([]);
  });

  it('emits Amazon entered/exited events from real presence transitions', () => {
    const t = [0, DAY, 2 * DAY, 3 * DAY];
    const v = [10, null, null, 12]; // present -> absent -> present
    const snap = snapshot({ amazonPrice: { t, v } });
    const events = buildTimeline(snap);
    expect(events).toEqual([
      { at: DAY,     label: 'Amazon exited listing' },
      { at: 3 * DAY, label: 'Amazon entered listing' },
    ]);
  });

  it('emits a Buy Box stabilized event when there is a real stable streak', () => {
    const t = Array.from({ length: 10 }, (_, i) => i * DAY);
    const v = Array.from({ length: 10 }, () => 19.99);
    const snap = snapshot({ buyBoxPrice: { t, v } });
    const events = buildTimeline(snap);
    expect(events).toHaveLength(1);
    expect(events[0].label).toBe('Buy Box stabilized');
    expect(events[0].at).toBe(0); // streak spans the whole 9-day window from t=0
  });

  it('returns events sorted chronologically', () => {
    const t = [0, DAY, 2 * DAY, 3 * DAY];
    const v = [10, null, null, 12];
    const snap = snapshot({ amazonPrice: { t, v } });
    const events = buildTimeline(snap);
    expect(events[0].at).toBeLessThan(events[1].at);
  });
});
