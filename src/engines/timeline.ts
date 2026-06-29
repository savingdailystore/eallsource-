// Opportunity Timeline (Phase 1, Feature 3).
//
// Builds a chronological list of real, dated events from Product.keepaHistory
// — Amazon entering/exiting the listing, and when the Buy Box's current
// stability streak began. Nothing here is synthesized: an event only exists
// if keepaHistoryMetrics found an actual transition or streak in the stored
// series. Returns [] when there's no history yet (e.g. the product hasn't
// been rescanned since this feature shipped) rather than guessing.
//
// Deliberately does NOT append a final "Current → <recommendation>" node —
// that's the Confidence Engine's judgment (engines/confidence.ts), not a
// historical fact, and keeping this model historical-only avoids one engine
// depending on another's output. The UI composes both.

import type { TimelineEvent } from '@/types';
import type { KeepaHistorySnapshot } from '@/lib/keepa';
import { amazonTransitions, buyBoxStableStreakDays } from './keepaHistoryMetrics';

export function buildTimeline(history: KeepaHistorySnapshot | null | undefined): TimelineEvent[] {
  if (!history) return [];

  const events: TimelineEvent[] = amazonTransitions(history).map((tr) => ({
    at:    tr.at,
    label: tr.type === 'ENTERED' ? 'Amazon entered listing' : 'Amazon exited listing',
  }));

  const streakDays = buyBoxStableStreakDays(history);
  if (streakDays && streakDays > 0) {
    const latestTime = history.buyBoxPrice.t[history.buyBoxPrice.t.length - 1];
    if (latestTime != null) {
      events.push({
        at:    latestTime - streakDays * 24 * 60 * 60 * 1000,
        label: 'Buy Box stabilized',
      });
    }
  }

  return events.sort((a, b) => a.at - b.at);
}
