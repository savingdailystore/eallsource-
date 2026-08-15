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

const MS_1H  =       60 * 60 * 1000;
const MS_3D  =   3 * 24 * 60 * 60 * 1000;
const MS_10D =  10 * 24 * 60 * 60 * 1000;
const MS_35D =  35 * 24 * 60 * 60 * 1000;
const MS_48H =  48 * 60 * 60 * 1000;
const MS_7D  =   7 * 24 * 60 * 60 * 1000;
const MS_30D =  30 * 24 * 60 * 60 * 1000;

// Full valid input to base variations off of
const VALID = {
  feeEstimateSource:  'SP_API',
  feeEstimatedAt:     ago(MS_1H),
  feeEstimatePrice:   28.00,
  currentResellPrice: 28.00,
  referralFee:        3.00,
  fbaFee:             4.50,
  now:                NOW,
} as const;

describe('resolveFeeFreshnessStatus — fee amount validation', () => {
  it('returns FRESH when SP_API + fresh date + referralFee > 0 + fbaFee > 0', () => {
    expect(resolveFeeFreshnessStatus(VALID)).toBe('FRESH');
  });

  it('returns UNAVAILABLE when referralFee is missing/null', () => {
    expect(resolveFeeFreshnessStatus({ ...VALID, referralFee: null })).toBe('UNAVAILABLE');
    expect(resolveFeeFreshnessStatus({ ...VALID, referralFee: undefined })).toBe('UNAVAILABLE');
  });

  it('returns UNAVAILABLE when fbaFee is missing/null', () => {
    expect(resolveFeeFreshnessStatus({ ...VALID, fbaFee: null })).toBe('UNAVAILABLE');
    expect(resolveFeeFreshnessStatus({ ...VALID, fbaFee: undefined })).toBe('UNAVAILABLE');
  });

  it('returns UNAVAILABLE when referralFee is 0', () => {
    expect(resolveFeeFreshnessStatus({ ...VALID, referralFee: 0 })).toBe('UNAVAILABLE');
  });

  it('returns UNAVAILABLE when fbaFee is 0', () => {
    expect(resolveFeeFreshnessStatus({ ...VALID, fbaFee: 0 })).toBe('UNAVAILABLE');
  });

  it('returns UNAVAILABLE when referralFee is negative', () => {
    expect(resolveFeeFreshnessStatus({ ...VALID, referralFee: -1 })).toBe('UNAVAILABLE');
  });

  it('returns UNAVAILABLE when fbaFee is negative', () => {
    expect(resolveFeeFreshnessStatus({ ...VALID, fbaFee: -1 })).toBe('UNAVAILABLE');
  });
});

describe('resolveFeeFreshnessStatus — source and date guards', () => {
  it('returns UNAVAILABLE when feeEstimateSource is STATIC even with valid fees', () => {
    expect(resolveFeeFreshnessStatus({ ...VALID, feeEstimateSource: 'STATIC' })).toBe('UNAVAILABLE');
  });

  it('returns UNAVAILABLE when feeEstimateSource is null', () => {
    expect(resolveFeeFreshnessStatus({ ...VALID, feeEstimateSource: null })).toBe('UNAVAILABLE');
  });

  it('returns UNAVAILABLE when feeEstimateSource is undefined', () => {
    expect(resolveFeeFreshnessStatus({ ...VALID, feeEstimateSource: undefined })).toBe('UNAVAILABLE');
  });

  it('returns UNAVAILABLE when feeEstimatedAt is null (source SP_API, valid fees)', () => {
    expect(resolveFeeFreshnessStatus({ ...VALID, feeEstimatedAt: null })).toBe('UNAVAILABLE');
  });

  it('returns UNAVAILABLE when feeEstimatedAt is undefined', () => {
    expect(resolveFeeFreshnessStatus({ ...VALID, feeEstimatedAt: undefined })).toBe('UNAVAILABLE');
  });
});

describe('resolveFeeFreshnessStatus — stale thresholds (with valid fees)', () => {
  it('returns FRESH when estimate is under 48h old', () => {
    expect(resolveFeeFreshnessStatus({ ...VALID, feeEstimatedAt: ago(MS_48H - MS_1H) })).toBe('FRESH');
  });

  it('returns NEEDS_RECHECK when estimate is 3 days old', () => {
    expect(resolveFeeFreshnessStatus({ ...VALID, feeEstimatedAt: ago(MS_3D) })).toBe('NEEDS_RECHECK');
  });

  it('returns NEEDS_RECHECK when estimate is exactly 48h old', () => {
    expect(resolveFeeFreshnessStatus({ ...VALID, feeEstimatedAt: ago(MS_48H) })).toBe('NEEDS_RECHECK');
  });

  it('returns STALE when estimate is 10 days old', () => {
    expect(resolveFeeFreshnessStatus({ ...VALID, feeEstimatedAt: ago(MS_10D) })).toBe('STALE');
  });

  it('returns STALE when estimate is exactly 7 days old', () => {
    expect(resolveFeeFreshnessStatus({ ...VALID, feeEstimatedAt: ago(MS_7D) })).toBe('STALE');
  });

  it('returns VERY_STALE when estimate is 35 days old', () => {
    expect(resolveFeeFreshnessStatus({ ...VALID, feeEstimatedAt: ago(MS_35D) })).toBe('VERY_STALE');
  });

  it('returns VERY_STALE when estimate is exactly 30 days old', () => {
    expect(resolveFeeFreshnessStatus({ ...VALID, feeEstimatedAt: ago(MS_30D) })).toBe('VERY_STALE');
  });

  it('returns NEEDS_RECHECK when price changed >10% even if estimate is fresh', () => {
    expect(resolveFeeFreshnessStatus({
      ...VALID,
      feeEstimatedAt:     ago(MS_1H),
      feeEstimatePrice:   28.00,
      currentResellPrice: 33.60, // 20% increase
    })).toBe('NEEDS_RECHECK');
  });
});
