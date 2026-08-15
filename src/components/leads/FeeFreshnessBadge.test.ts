/**
 * Phase 20.2M-1D-5 — Fee Freshness Badge Logic Tests
 *
 * Tests the resolveFeeFreshnessStatus helper — no DOM required.
 * All tests supply `now` explicitly so they are deterministic.
 */

import { describe, it, expect } from 'vitest';
import { resolveFeeFreshnessStatus } from './feeFreshnessStatus';

const NOW = new Date('2026-08-09T12:00:00.000Z');

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

const MS_1H  =      60 * 60 * 1000;
const MS_3D  =   3 * 24 * 60 * 60 * 1000;
const MS_10D =  10 * 24 * 60 * 60 * 1000;
const MS_35D =  35 * 24 * 60 * 60 * 1000;

describe('resolveFeeFreshnessStatus', () => {
  it('returns UNAVAILABLE when feeEstimateSource is null', () => {
    expect(resolveFeeFreshnessStatus({
      feeEstimateSource: null,
      feeEstimatedAt: ago(MS_1H),
      now: NOW,
    })).toBe('UNAVAILABLE');
  });

  it('returns UNAVAILABLE when feeEstimateSource is undefined', () => {
    expect(resolveFeeFreshnessStatus({
      feeEstimatedAt: ago(MS_1H),
      now: NOW,
    })).toBe('UNAVAILABLE');
  });

  it('returns UNAVAILABLE when feeEstimateSource is STATIC (not SP_API)', () => {
    expect(resolveFeeFreshnessStatus({
      feeEstimateSource: 'STATIC',
      feeEstimatedAt: ago(MS_1H),
      now: NOW,
    })).toBe('UNAVAILABLE');
  });

  it('returns UNAVAILABLE when source is SP_API but feeEstimatedAt is null', () => {
    expect(resolveFeeFreshnessStatus({
      feeEstimateSource: 'SP_API',
      feeEstimatedAt: null,
      now: NOW,
    })).toBe('UNAVAILABLE');
  });

  it('returns UNAVAILABLE when source is SP_API but feeEstimatedAt is undefined', () => {
    expect(resolveFeeFreshnessStatus({
      feeEstimateSource: 'SP_API',
      now: NOW,
    })).toBe('UNAVAILABLE');
  });

  it('returns FRESH when source is SP_API and estimate is under 48 hours old', () => {
    expect(resolveFeeFreshnessStatus({
      feeEstimateSource: 'SP_API',
      feeEstimatedAt: ago(MS_1H),
      now: NOW,
    })).toBe('FRESH');
  });

  it('returns NEEDS_RECHECK when source is SP_API and estimate is 3 days old', () => {
    expect(resolveFeeFreshnessStatus({
      feeEstimateSource: 'SP_API',
      feeEstimatedAt: ago(MS_3D),
      now: NOW,
    })).toBe('NEEDS_RECHECK');
  });

  it('returns STALE when source is SP_API and estimate is 10 days old', () => {
    expect(resolveFeeFreshnessStatus({
      feeEstimateSource: 'SP_API',
      feeEstimatedAt: ago(MS_10D),
      now: NOW,
    })).toBe('STALE');
  });

  it('returns VERY_STALE when source is SP_API and estimate is 35 days old', () => {
    expect(resolveFeeFreshnessStatus({
      feeEstimateSource: 'SP_API',
      feeEstimatedAt: ago(MS_35D),
      now: NOW,
    })).toBe('VERY_STALE');
  });

  it('returns NEEDS_RECHECK when source is SP_API, estimate is fresh, but price changed more than 10%', () => {
    expect(resolveFeeFreshnessStatus({
      feeEstimateSource:  'SP_API',
      feeEstimatedAt:     ago(MS_1H),
      feeEstimatePrice:   28.00,
      currentResellPrice: 33.60, // 20% increase
      now: NOW,
    })).toBe('NEEDS_RECHECK');
  });
});
