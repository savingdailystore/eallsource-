import { History } from 'lucide-react';
import type { HistoricalInsight } from '@/types';

// Dumb presentation component — Feature 5. All derivation happens in
// engines/historicalInsights.ts; renders nothing if there are no provable
// insights yet (e.g. product hasn't been rescanned since this shipped).

export function HistoricalInsights({ insights }: { insights: HistoricalInsight[] }) {
  if (insights.length === 0) return null;

  return (
    <div className="card p-5">
      <h2 className="font-semibold text-slate-50 mb-3 flex items-center gap-2">
        <History className="w-4 h-4 text-slate-400" />Historical Sales Intelligence
      </h2>
      <div className="space-y-1.5">
        {insights.map((insight, i) => (
          <div key={i} className="text-sm text-slate-300">{insight.text}</div>
        ))}
      </div>
    </div>
  );
}
