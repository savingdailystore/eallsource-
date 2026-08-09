/**
 * Fee staleness engine — pure, deterministic, no I/O.
 *
 * Determines how fresh a stored Amazon fee estimate is, based on:
 *   1. How old the estimate is (date-based severity)
 *   2. Whether the resell price has moved enough to invalidate the estimate
 *      (fees are price-dependent; a 10%+ price shift warrants a recheck)
 *
 * Date-based severity always wins if it is worse than the price-change severity.
 */

export type FeeStaleStatus = 'FRESH' | 'NEEDS_RECHECK' | 'STALE' | 'VERY_STALE';

const MS_48H  =  48 * 60 * 60 * 1000;
const MS_7D   =   7 * 24 * 60 * 60 * 1000;
const MS_30D  =  30 * 24 * 60 * 60 * 1000;
const PRICE_CHANGE_THRESHOLD = 0.10; // >10% triggers NEEDS_RECHECK

// Severity ordering: higher index = more severe
const SEVERITY: FeeStaleStatus[] = ['FRESH', 'NEEDS_RECHECK', 'STALE', 'VERY_STALE'];

function worse(a: FeeStaleStatus, b: FeeStaleStatus): FeeStaleStatus {
  return SEVERITY.indexOf(a) >= SEVERITY.indexOf(b) ? a : b;
}

export function getFeeStaleStatus(input: {
  feeEstimatedAt?:     Date | string | null;
  feeEstimatePrice?:   number | null;
  currentResellPrice?: number | null;
  now?:                Date | string;
}): FeeStaleStatus {
  const { feeEstimatedAt, feeEstimatePrice, currentResellPrice } = input;

  // ── 1. Date-based staleness ────────────────────────────────────────────────
  let dateSeverity: FeeStaleStatus = 'VERY_STALE'; // default when missing/invalid

  if (feeEstimatedAt != null) {
    const estimatedMs = new Date(feeEstimatedAt).getTime();
    if (!Number.isNaN(estimatedMs)) {
      const nowMs  = new Date(input.now ?? new Date()).getTime();
      const ageMs  = nowMs - estimatedMs;

      if      (ageMs >= MS_30D) dateSeverity = 'VERY_STALE';
      else if (ageMs >= MS_7D)  dateSeverity = 'STALE';
      else if (ageMs >= MS_48H) dateSeverity = 'NEEDS_RECHECK';
      else                      dateSeverity = 'FRESH';
    }
  }

  // ── 2. Price-change staleness ──────────────────────────────────────────────
  // Only meaningful when both prices are valid positive numbers.
  // A >10% shift means Amazon's fee schedule (which is price-dependent) may
  // have changed enough that the stored estimate is no longer accurate.
  // Exactly 10% difference stays FRESH — the threshold is strictly greater than.
  let priceSeverity: FeeStaleStatus = 'FRESH';

  if (
    feeEstimatePrice   != null && feeEstimatePrice   > 0 &&
    currentResellPrice != null && currentResellPrice > 0
  ) {
    // Use the smaller price as the denominator so the comparison is symmetric:
    //   feeEstimatePrice=28, current=30.80 → 2.80/28 = 10.00%
    //   feeEstimatePrice=30.80, current=28 → 2.80/28 = 10.00%  (same result)
    // Round to 6 decimal places to eliminate IEEE 754 noise at the boundary.
    // e.g. (30.80 - 28) / 28 = 0.10000000000000002 in float → rounds to 0.100000 → not > 0.10.
    const rawPct = Math.abs(currentResellPrice - feeEstimatePrice) /
                   Math.min(feeEstimatePrice, currentResellPrice);
    const pctChange = Math.round(rawPct * 1_000_000) / 1_000_000;
    if (pctChange > PRICE_CHANGE_THRESHOLD) {
      priceSeverity = 'NEEDS_RECHECK';
    }
  }

  // ── 3. Return the worse of the two severities ──────────────────────────────
  return worse(dateSeverity, priceSeverity);
}
