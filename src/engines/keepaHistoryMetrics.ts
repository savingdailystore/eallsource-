// Derived metrics from Product.keepaHistory (see KeepaHistorySnapshot in
// src/lib/keepa.ts). This is the single place that reads the raw time series
// — the confidence, timeline, and historical-insight engines all consume
// these functions instead of each re-deriving the same facts from the
// snapshot, so there is exactly one definition of e.g. "Amazon absence %".
//
// Every function here returns `undefined` when the snapshot doesn't have
// enough data to support the claim — callers must treat `undefined` as "we
// don't know," never substitute a guess. This is what keeps Phase 1 from
// fabricating historical intelligence.

import type { KeepaHistorySnapshot, KeepaSeries } from '@/lib/keepa';
import { computeTrend, computeStability } from '@/lib/keepa';

const MIN_POINTS_FOR_CLAIM = 5;

// ─── Amazon presence ────────────────────────────────────────────────────────

export interface AmazonPresence {
  presentPct: number; // % of recorded points where Amazon had a price (was selling)
  absentPct:  number;
  pointCount: number;
}

export function amazonPresence(history: KeepaHistorySnapshot): AmazonPresence | undefined {
  const { v } = history.amazonPrice;
  if (v.length < MIN_POINTS_FOR_CLAIM) return undefined;

  const present = v.filter((x) => x != null).length;
  return {
    presentPct: Math.round((present / v.length) * 1000) / 10,
    absentPct:  Math.round(((v.length - present) / v.length) * 1000) / 10,
    pointCount: v.length,
  };
}

export interface AmazonTransition {
  at:   number; // unix ms
  type: 'ENTERED' | 'EXITED'; // Amazon started / stopped selling
}

// Walks the amazonPrice series once, in chronological order, and emits an
// event each time presence flips. Consecutive points of the same presence
// state produce no event — only the transition itself is a real event.
export function amazonTransitions(history: KeepaHistorySnapshot): AmazonTransition[] {
  const { t, v } = history.amazonPrice;
  const events: AmazonTransition[] = [];
  let wasPresent: boolean | null = null;

  for (let i = 0; i < t.length; i++) {
    const isPresent = v[i] != null;
    if (wasPresent !== null && isPresent !== wasPresent) {
      events.push({ at: t[i], type: isPresent ? 'ENTERED' : 'EXITED' });
    }
    wasPresent = isPresent;
  }
  return events;
}

// ─── Buy Box stability ──────────────────────────────────────────────────────

// How many trailing days the Buy Box price has held within Keepa's existing
// "STABLE" coefficient-of-variation rule, walking backward from the most
// recent point. Returns undefined when there isn't enough history to judge.
export function buyBoxStableStreakDays(history: KeepaHistorySnapshot): number | undefined {
  const { t, v } = history.buyBoxPrice;
  const prices = v.filter((x): x is number => x != null);
  if (prices.length < MIN_POINTS_FOR_CLAIM) return undefined;

  // Shrink the trailing window until it's no longer STABLE by the same CV
  // rule used elsewhere (see computeStability in lib/keepa.ts); the last
  // window that was still STABLE marks the start of the current streak.
  // Start from the earliest index that still gives a judgeable-size window —
  // anything more recent than that is too few points to call STABLE/VOLATILE.
  const startIdx0 = v.length - MIN_POINTS_FOR_CLAIM;
  if (startIdx0 < 0) return undefined;

  let streakStartIdx = startIdx0;
  for (let i = startIdx0; i >= 0; i--) {
    const window = v.slice(i).filter((x): x is number => x != null);
    if (window.length < MIN_POINTS_FOR_CLAIM) break;
    if (computeStability(window) !== 'STABLE') break;
    streakStartIdx = i;
  }

  const startTime = t[streakStartIdx];
  const endTime   = t[t.length - 1];
  if (startTime == null || endTime == null || startTime === endTime) return undefined;
  return Math.round((endTime - startTime) / (24 * 60 * 60 * 1000));
}

// ─── Sales rank (BSR) trend ─────────────────────────────────────────────────

export function bsrTrendPct(history: KeepaHistorySnapshot): number | undefined {
  const ranks = history.salesRank.v.filter((x): x is number => x != null);
  if (ranks.length < 12) return undefined;
  const { trend, pct } = computeTrend(ranks);
  // BSR is "lower is better" — computeTrend's RISING/DECLINING is about the
  // raw number, so a falling BSR (good) reads as DECLINING. Report the
  // signed % as-is; callers interpret the sign themselves.
  return trend === 'UNKNOWN' ? undefined : pct;
}

// ─── Generic series helper (exported for the historical-insight engine) ────

export function latestNonNull(series: KeepaSeries): number | undefined {
  for (let i = series.v.length - 1; i >= 0; i--) {
    if (series.v[i] != null) return series.v[i] as number;
  }
  return undefined;
}
