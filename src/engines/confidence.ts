// AI Confidence Engine (Phase 1, Features 1 & 2).
//
// Confidence is a separate judgment from the existing lead score (see
// engines/scoring.ts) — it answers "should I buy this?" by blending the
// score with historical corroboration the score formula doesn't see (Amazon
// presence pattern, Buy Box stability streak, review depth). It does NOT
// recompute ROI/demand/risk weighting; it reuses the already-computed score
// and Product fields, plus stabilityScore (imported, not duplicated).
//
// One signal evaluator (`evaluateSignals`) is the single source of truth for
// both Feature 1's capped "primary reasons" and Feature 2's full
// reasons/concerns lists — every bullet is a deterministic check against a
// real field. Nothing here is generated or estimated text.

import type { ConfidenceInput, ConfidenceResult, ConfidenceSignal } from '@/types';
import { stabilityScore } from './scoring';
import { amazonPresence, buyBoxStableStreakDays } from './keepaHistoryMetrics';

const PRIMARY_REASONS_CAP = 5;

function reviewQualityScore(rating?: number | null, reviewCount?: number | null): number {
  if (rating == null || reviewCount == null) return 50; // no data — neutral, not penalized
  if (rating >= 4.3 && reviewCount >= 50) return 100;
  if (rating >= 4.0 && reviewCount >= 20) return 75;
  if (rating < 3.5 || reviewCount < 5)    return 20;
  return 50;
}

function competitionScore(totalSellers: number): number {
  if (totalSellers <= 2)  return 100;
  if (totalSellers <= 5)  return 75;
  if (totalSellers <= 10) return 50;
  return 25;
}

function amazonAbsenceScore(input: ConfidenceInput): number {
  const presence = input.keepaHistory ? amazonPresence(input.keepaHistory) : undefined;
  if (presence) return presence.absentPct; // more absence = more room for a buy box win
  return input.amazonIsSeller ? 0 : 50; // no history — fall back to the current snapshot, neutrally
}

// ─── Signal evaluation — single source of truth for Features 1 & 2 ─────────

function evaluateSignals(input: ConfidenceInput): { positives: ConfidenceSignal[]; negatives: ConfidenceSignal[] } {
  const positives: ConfidenceSignal[] = [];
  const negatives: ConfidenceSignal[] = [];
  const presence       = input.keepaHistory ? amazonPresence(input.keepaHistory) : undefined;
  const stableStreak   = input.keepaHistory ? buyBoxStableStreakDays(input.keepaHistory) : undefined;

  // ROI
  if (input.roi >= 50)      positives.push({ label: 'Strong ROI', weight: 9 });
  else if (input.roi < 20)  negatives.push({ label: 'ROI is below a typical target', weight: 8 });

  // Buy Box stability
  if (input.priceStability === 'STABLE') {
    positives.push({
      label: stableStreak ? `Stable Buy Box (steady for ~${stableStreak} days)` : 'Stable Buy Box',
      weight: 8,
    });
  } else if (input.priceStability === 'VOLATILE') {
    negatives.push({ label: 'Buy Box price has been volatile', weight: 7 });
  }

  // Amazon presence (only claim this when real history backs it)
  if (presence) {
    if (presence.absentPct >= 60) {
      positives.push({ label: `Amazon rarely in stock (absent ${presence.absentPct}% of recorded history)`, weight: 10 });
    } else if (presence.absentPct > 0 && presence.absentPct < 60) {
      negatives.push({ label: 'Amazon has returned to this listing periodically', weight: 6 });
    } else if (presence.absentPct === 0) {
      negatives.push({ label: 'Amazon has been consistently selling this listing', weight: 9 });
    }
  }

  // Competition
  if (input.totalSellers <= 3)       positives.push({ label: 'Healthy competition (few active sellers)', weight: 6 });
  else if (input.totalSellers > 10)  negatives.push({ label: 'Higher than average seller competition', weight: 5 });

  // Demand
  if (input.demandLevel === 'HIGH' || input.demandLevel === 'MEDIUM') {
    positives.push({ label: 'Consistent historical demand', weight: 7 });
  } else if (input.demandLevel === 'LOW') {
    negatives.push({ label: 'Demand signal is weak', weight: 6 });
  }

  // Gating / IP risk
  if (input.gatingRisk === 'MEDIUM' || input.gatingRisk === 'HIGH') {
    negatives.push({ label: 'Some gating or IP risk on this listing', weight: 7 });
  }

  // Buy Box suppression
  if (input.buyBoxSuppressed) {
    negatives.push({ label: 'Buy Box is currently suppressed', weight: 6 });
  }

  // Reviews
  if (input.rating != null && input.reviewCount != null && input.rating >= 4.3 && input.reviewCount >= 50) {
    positives.push({ label: 'Well-reviewed, established listing', weight: 4 });
  } else if (input.lowReviews) {
    negatives.push({ label: 'Few reviews — listing is not yet well established', weight: 4 });
  }

  // Price trend
  if (input.priceTrend === 'DECLINING') {
    negatives.push({ label: 'Price has been trending down', weight: 5 });
  }

  return {
    positives: positives.sort((a, b) => b.weight - a.weight),
    negatives: negatives.sort((a, b) => b.weight - a.weight),
  };
}

// ─── Confidence score ────────────────────────────────────────────────────────

function deriveConfidence(input: ConfidenceInput): number {
  const corroboration = (
    stabilityScore(input.priceStability) +
    amazonAbsenceScore(input) +
    competitionScore(input.totalSellers) +
    reviewQualityScore(input.rating, input.reviewCount)
  ) / 4;

  // The score already encodes ROI/demand/match/risk/stability; corroboration
  // adds historical context the score doesn't see. 60/40 keeps the score
  // dominant rather than letting a single secondary signal swing the result.
  return Math.round(Math.max(0, Math.min(100, input.score * 0.6 + corroboration * 0.4)));
}

function recommendationFor(confidence: number): ConfidenceResult['recommendation'] {
  if (confidence >= 90) return 'Excellent Buy';
  if (confidence >= 75) return 'Strong Buy';
  if (confidence >= 55) return 'Good Buy';
  if (confidence >= 35) return 'Risky';
  return 'Avoid';
}

export function buildConfidence(input: ConfidenceInput): ConfidenceResult {
  const confidence = deriveConfidence(input);
  const { positives, negatives } = evaluateSignals(input);

  return {
    confidence,
    stars: Math.max(1, Math.min(5, Math.round(confidence / 20))),
    recommendation: recommendationFor(confidence),
    primaryReasons: positives.slice(0, PRIMARY_REASONS_CAP).map((s) => s.label),
    reasons:        positives.map((s) => s.label),
    concerns:       negatives.map((s) => s.label),
  };
}
