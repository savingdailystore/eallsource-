// Historical Sales Intelligence (Phase 1, Feature 5).
//
// Turns Product.keepaHistory into plain-language statements — but only ones
// that are directly provable from the stored series. Each insight is added
// only when the underlying keepaHistoryMetrics function returns a real
// value; when data is insufficient, that insight is simply omitted, never
// guessed.
//
// Deliberately NOT included: a seller-count/competition trend ("competition
// declined from 14 to 7 sellers"). Keepa's offerCountNew series (csv[11]) is
// persisted in the snapshot for future use, but Phase 1 doesn't yet have a
// verified, well-understood way to turn it into a trend statement with the
// same confidence as the other insights here — see the Phase 1 deliverable
// notes. Skip it rather than presenting an estimate as fact.

import type { HistoricalInsight } from '@/types';
import type { KeepaHistorySnapshot } from '@/lib/keepa';
import { amazonPresence, buyBoxStableStreakDays, bsrTrendPct } from './keepaHistoryMetrics';

export function buildHistoricalInsights(history: KeepaHistorySnapshot | null | undefined): HistoricalInsight[] {
  if (!history) return [];

  const insights: HistoricalInsight[] = [];

  const rankPct = bsrTrendPct(history);
  if (rankPct != null && rankPct !== 0) {
    const improved = rankPct < 0; // lower BSR = better rank
    insights.push({
      text: `Sales rank has ${improved ? 'improved' : 'worsened'} ${Math.abs(rankPct)}% over the recorded history.`,
    });
  }

  const streakDays = buyBoxStableStreakDays(history);
  if (streakDays != null && streakDays > 0) {
    insights.push({ text: `Price has remained stable for the last ${streakDays} day(s).` });
  }

  const presence = amazonPresence(history);
  if (presence) {
    if (presence.absentPct > 0) {
      insights.push({ text: `Amazon has been absent ${presence.absentPct}% of the recorded history.` });
    } else {
      insights.push({ text: 'Amazon has been present for the entire recorded history.' });
    }
  }

  return insights;
}
