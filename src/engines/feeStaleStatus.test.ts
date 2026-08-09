/**
 * Phase 20.2M-1D-3 — Fee Staleness Engine Tests
 *
 * All tests supply `now` explicitly so they are fully deterministic.
 */

import { describe, it, expect } from 'vitest';
import { getFeeStaleStatus } from './feeStaleStatus';

// Fixed reference point for all tests
const NOW = new Date('2026-08-09T12:00:00.000Z');

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

const MS_1H   =      60 * 60 * 1000;
const MS_24H  =  24 * 60 * 60 * 1000;
const MS_48H  =  48 * 60 * 60 * 1000;
const MS_7D   =   7 * 24 * 60 * 60 * 1000;
const MS_30D  =  30 * 24 * 60 * 60 * 1000;

// ── 1. Null / missing / invalid feeEstimatedAt ───────────────────────────────

describe('getFeeStaleStatus — null / missing / invalid feeEstimatedAt', () => {
  it('returns VERY_STALE when feeEstimatedAt is null', () => {
    expect(getFeeStaleStatus({ feeEstimatedAt: null, now: NOW })).toBe('VERY_STALE');
  });

  it('returns VERY_STALE when feeEstimatedAt is undefined', () => {
    expect(getFeeStaleStatus({ now: NOW })).toBe('VERY_STALE');
  });

  it('returns VERY_STALE when feeEstimatedAt is an invalid date string', () => {
    expect(getFeeStaleStatus({ feeEstimatedAt: 'not-a-date', now: NOW })).toBe('VERY_STALE');
  });

  it('returns VERY_STALE when feeEstimatedAt is an empty string', () => {
    expect(getFeeStaleStatus({ feeEstimatedAt: '', now: NOW })).toBe('VERY_STALE');
  });
});

// ── 2. Date-based staleness thresholds ──────────────────────────────────────

describe('getFeeStaleStatus — date-based thresholds', () => {
  it('returns VERY_STALE when estimate is exactly 30 days old', () => {
    expect(getFeeStaleStatus({ feeEstimatedAt: ago(MS_30D), now: NOW })).toBe('VERY_STALE');
  });

  it('returns VERY_STALE when estimate is older than 30 days', () => {
    expect(getFeeStaleStatus({ feeEstimatedAt: ago(MS_30D + MS_1H), now: NOW })).toBe('VERY_STALE');
  });

  it('returns STALE when estimate is exactly 7 days old', () => {
    expect(getFeeStaleStatus({ feeEstimatedAt: ago(MS_7D), now: NOW })).toBe('STALE');
  });

  it('returns STALE when estimate is between 7 and 30 days old', () => {
    expect(getFeeStaleStatus({ feeEstimatedAt: ago(MS_7D + MS_1H), now: NOW })).toBe('STALE');
    expect(getFeeStaleStatus({ feeEstimatedAt: ago(MS_30D - MS_1H), now: NOW })).toBe('STALE');
  });

  it('returns NEEDS_RECHECK when estimate is exactly 48 hours old', () => {
    expect(getFeeStaleStatus({ feeEstimatedAt: ago(MS_48H), now: NOW })).toBe('NEEDS_RECHECK');
  });

  it('returns NEEDS_RECHECK when estimate is between 48 hours and 7 days old', () => {
    expect(getFeeStaleStatus({ feeEstimatedAt: ago(MS_48H + MS_1H), now: NOW })).toBe('NEEDS_RECHECK');
    expect(getFeeStaleStatus({ feeEstimatedAt: ago(MS_7D - MS_1H), now: NOW })).toBe('NEEDS_RECHECK');
  });

  it('returns FRESH when estimate is under 48 hours old with no price change', () => {
    expect(getFeeStaleStatus({ feeEstimatedAt: ago(MS_48H - MS_1H), now: NOW })).toBe('FRESH');
    expect(getFeeStaleStatus({ feeEstimatedAt: ago(MS_24H), now: NOW })).toBe('FRESH');
    expect(getFeeStaleStatus({ feeEstimatedAt: ago(MS_1H), now: NOW })).toBe('FRESH');
  });
});

// ── 3. Price-change staleness ────────────────────────────────────────────────

describe('getFeeStaleStatus — price-change rule', () => {
  // Use a fresh timestamp (1 hour ago) so date-based severity is FRESH;
  // only the price difference should drive the result.
  const freshAt = ago(MS_1H);

  it('returns NEEDS_RECHECK when price increased by more than 10%', () => {
    // 20% increase: 28 → 33.60
    expect(getFeeStaleStatus({
      feeEstimatedAt: freshAt, feeEstimatePrice: 28.00, currentResellPrice: 33.60, now: NOW,
    })).toBe('NEEDS_RECHECK');
  });

  it('returns NEEDS_RECHECK when price decreased by more than 10%', () => {
    // 15% decrease: 28 → 23.80
    expect(getFeeStaleStatus({
      feeEstimatedAt: freshAt, feeEstimatePrice: 28.00, currentResellPrice: 23.80, now: NOW,
    })).toBe('NEEDS_RECHECK');
  });

  // ── Boundary tests: the threshold is strictly GREATER THAN 10% ──────────────
  // The engine uses Math.min(a,b) as the denominator so the result is symmetric:
  // both "28→30.80" and "30.80→28" produce 2.80/28 = 10.000%, which rounds to
  // exactly 0.100000 and is NOT > 0.10 → FRESH.

  it('returns FRESH when price increased by exactly 10% (28 → 30.80)', () => {
    // (30.80 - 28) / 28 = 0.10000000000000002 in IEEE 754.
    // Rounding to 6 decimal places → 0.100000 → not > 0.10 → FRESH.
    expect(getFeeStaleStatus({
      feeEstimatedAt: freshAt, feeEstimatePrice: 28.00, currentResellPrice: 30.80, now: NOW,
    })).toBe('FRESH');
  });

  it('returns FRESH when price decreased by exactly 10% (30.80 → 28)', () => {
    // Symmetric: (30.80 - 28) / min(28, 30.80) = 2.80 / 28 = 10.000% → FRESH.
    expect(getFeeStaleStatus({
      feeEstimatedAt: freshAt, feeEstimatePrice: 30.80, currentResellPrice: 28.00, now: NOW,
    })).toBe('FRESH');
  });

  it('returns NEEDS_RECHECK when price increased by slightly above 10% (28 → 30.81)', () => {
    // (30.81 - 28) / 28 = 0.10035714... → rounds to 0.100357 → > 0.10 → NEEDS_RECHECK.
    expect(getFeeStaleStatus({
      feeEstimatedAt: freshAt, feeEstimatePrice: 28.00, currentResellPrice: 30.81, now: NOW,
    })).toBe('NEEDS_RECHECK');
  });

  it('returns NEEDS_RECHECK when price decreased by slightly above 10% (30.81 → 28)', () => {
    // Symmetric: (30.81 - 28) / min(28, 30.81) = 2.81 / 28 = 0.10035714... → NEEDS_RECHECK.
    expect(getFeeStaleStatus({
      feeEstimatedAt: freshAt, feeEstimatePrice: 30.81, currentResellPrice: 28.00, now: NOW,
    })).toBe('NEEDS_RECHECK');
  });

  it('returns FRESH when price changed by less than 10%', () => {
    // 5% increase: 28 → 29.40
    expect(getFeeStaleStatus({
      feeEstimatedAt: freshAt, feeEstimatePrice: 28.00, currentResellPrice: 29.40, now: NOW,
    })).toBe('FRESH');
  });

  it('returns FRESH when prices are identical', () => {
    expect(getFeeStaleStatus({
      feeEstimatedAt: freshAt, feeEstimatePrice: 28.00, currentResellPrice: 28.00, now: NOW,
    })).toBe('FRESH');
  });
});

// ── 4. Precedence — date severity wins when worse than price severity ─────────

describe('getFeeStaleStatus — date-based severity takes precedence', () => {
  it('returns STALE (not NEEDS_RECHECK) when estimate is 10 days old with 20% price change', () => {
    // Date: 10 days old → STALE. Price: 20% change → NEEDS_RECHECK.
    // STALE is worse, so STALE wins.
    expect(getFeeStaleStatus({
      feeEstimatedAt:    ago(10 * MS_24H),
      feeEstimatePrice:  28.00,
      currentResellPrice: 33.60,  // 20% increase
      now: NOW,
    })).toBe('STALE');
  });

  it('returns VERY_STALE (not NEEDS_RECHECK) when estimate is 35 days old with 20% price change', () => {
    expect(getFeeStaleStatus({
      feeEstimatedAt:    ago(35 * MS_24H),
      feeEstimatePrice:  28.00,
      currentResellPrice: 33.60,
      now: NOW,
    })).toBe('VERY_STALE');
  });

  it('returns NEEDS_RECHECK (from price) when estimate is 1 day old with 20% price change', () => {
    // Date: 1 day old → FRESH. Price: 20% change → NEEDS_RECHECK.
    // NEEDS_RECHECK is worse than FRESH, so NEEDS_RECHECK wins.
    expect(getFeeStaleStatus({
      feeEstimatedAt:    ago(MS_24H),
      feeEstimatePrice:  28.00,
      currentResellPrice: 33.60,
      now: NOW,
    })).toBe('NEEDS_RECHECK');
  });

  it('returns NEEDS_RECHECK (from date) when estimate is 3 days old with no price change', () => {
    // Date: 3 days old → NEEDS_RECHECK. Price: no change → FRESH.
    // NEEDS_RECHECK is worse than FRESH, so NEEDS_RECHECK wins.
    expect(getFeeStaleStatus({
      feeEstimatedAt:    ago(3 * MS_24H),
      feeEstimatePrice:  28.00,
      currentResellPrice: 28.00,
      now: NOW,
    })).toBe('NEEDS_RECHECK');
  });
});

// ── 5. Missing / invalid price values ────────────────────────────────────────

describe('getFeeStaleStatus — missing / invalid price inputs', () => {
  const freshAt = ago(MS_1H);

  it('does not crash when feeEstimatePrice is missing', () => {
    expect(() => getFeeStaleStatus({ feeEstimatedAt: freshAt, now: NOW })).not.toThrow();
    expect(getFeeStaleStatus({ feeEstimatedAt: freshAt, now: NOW })).toBe('FRESH');
  });

  it('does not crash when currentResellPrice is missing', () => {
    expect(() => getFeeStaleStatus({
      feeEstimatedAt: freshAt, feeEstimatePrice: 28.00, now: NOW,
    })).not.toThrow();
    expect(getFeeStaleStatus({
      feeEstimatedAt: freshAt, feeEstimatePrice: 28.00, now: NOW,
    })).toBe('FRESH');
  });

  it('does not crash when both prices are null', () => {
    expect(() => getFeeStaleStatus({
      feeEstimatedAt: freshAt, feeEstimatePrice: null, currentResellPrice: null, now: NOW,
    })).not.toThrow();
    expect(getFeeStaleStatus({
      feeEstimatedAt: freshAt, feeEstimatePrice: null, currentResellPrice: null, now: NOW,
    })).toBe('FRESH');
  });

  it('does not trigger price-difference recheck when feeEstimatePrice is 0', () => {
    expect(getFeeStaleStatus({
      feeEstimatedAt: freshAt, feeEstimatePrice: 0, currentResellPrice: 28.00, now: NOW,
    })).toBe('FRESH');
  });

  it('does not trigger price-difference recheck when feeEstimatePrice is negative', () => {
    expect(getFeeStaleStatus({
      feeEstimatedAt: freshAt, feeEstimatePrice: -5, currentResellPrice: 28.00, now: NOW,
    })).toBe('FRESH');
  });

  it('does not trigger price-difference recheck when currentResellPrice is 0', () => {
    expect(getFeeStaleStatus({
      feeEstimatedAt: freshAt, feeEstimatePrice: 28.00, currentResellPrice: 0, now: NOW,
    })).toBe('FRESH');
  });

  it('does not trigger price-difference recheck when currentResellPrice is negative', () => {
    expect(getFeeStaleStatus({
      feeEstimatedAt: freshAt, feeEstimatePrice: 28.00, currentResellPrice: -1, now: NOW,
    })).toBe('FRESH');
  });
});

// ── 6. Input type flexibility ─────────────────────────────────────────────────

describe('getFeeStaleStatus — input type flexibility', () => {
  it('accepts feeEstimatedAt as a Date object', () => {
    const result = getFeeStaleStatus({ feeEstimatedAt: ago(MS_1H), now: NOW });
    expect(result).toBe('FRESH');
  });

  it('accepts feeEstimatedAt as an ISO date string', () => {
    const isoString = ago(MS_1H).toISOString();
    const result = getFeeStaleStatus({ feeEstimatedAt: isoString, now: NOW });
    expect(result).toBe('FRESH');
  });

  it('accepts now as a Date object', () => {
    const result = getFeeStaleStatus({ feeEstimatedAt: ago(MS_1H), now: NOW });
    expect(result).toBe('FRESH');
  });

  it('accepts now as an ISO string', () => {
    const result = getFeeStaleStatus({
      feeEstimatedAt: ago(MS_1H),
      now: NOW.toISOString(),
    });
    expect(result).toBe('FRESH');
  });

  it('is deterministic — same inputs always produce same output', () => {
    const input = { feeEstimatedAt: ago(MS_24H), feeEstimatePrice: 28.00, currentResellPrice: 29.00, now: NOW };
    expect(getFeeStaleStatus(input)).toBe(getFeeStaleStatus(input));
  });

  it('uses real clock when now is omitted (smoke test — just must not throw)', () => {
    expect(() => getFeeStaleStatus({ feeEstimatedAt: new Date() })).not.toThrow();
  });
});
