import { Clock } from 'lucide-react';
import type { TimelineEvent } from '@/types';

// Dumb presentation component — Feature 3. `events` are historical facts from
// engines/timeline.ts; `currentLabel` is the Confidence Engine's present-day
// judgment, composed here (not inside the timeline engine) since it's a
// separate kind of fact — see engines/timeline.ts for why.

export function OpportunityTimeline({ events, currentLabel }: { events: TimelineEvent[]; currentLabel: string }) {
  if (events.length === 0) return null;

  const fmt = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="card p-5">
      <h2 className="font-semibold text-slate-50 mb-4 flex items-center gap-2">
        <Clock className="w-4 h-4 text-slate-400" />Opportunity Timeline
      </h2>
      <div className="space-y-0">
        {events.map((event, i) => (
          <div key={`${event.at}-${i}`} className="flex items-start gap-3">
            <div className="flex flex-col items-center pt-1">
              <div className="w-2 h-2 rounded-full bg-slate-600" />
              {(i < events.length - 1 || currentLabel) && <div className="w-px flex-1 bg-slate-700 min-h-[24px]" />}
            </div>
            <div className="pb-4">
              <div className="text-xs text-slate-500">{fmt(event.at)}</div>
              <div className="text-sm text-slate-200">{event.label}</div>
            </div>
          </div>
        ))}
        <div className="flex items-start gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-400 mt-1" />
          <div>
            <div className="text-xs text-slate-500">Current</div>
            <div className="text-sm font-semibold text-blue-300">{currentLabel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
