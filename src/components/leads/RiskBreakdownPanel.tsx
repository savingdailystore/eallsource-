import type { RiskBreakdown, RiskLevel } from '@/types';

// Dumb presentation component — Feature 4. All categorization happens in
// engines/riskPresentation.ts; this just renders the result.

const LEVEL_STYLE: Record<RiskLevel, string> = {
  VERY_LOW: 'text-green-400',
  LOW:      'text-green-400',
  MEDIUM:   'text-amber-400',
  HIGH:     'text-red-400',
};

const LEVEL_LABEL: Record<RiskLevel, string> = {
  VERY_LOW: 'Very Low',
  LOW:      'Low',
  MEDIUM:   'Medium',
  HIGH:     'High',
};

export function RiskBreakdownPanel({ breakdown }: { breakdown: RiskBreakdown }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between rounded-xl border border-slate-700 px-3 py-2.5 mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Overall Risk</span>
        <span className={`text-sm font-bold ${LEVEL_STYLE[breakdown.overall]}`}>{LEVEL_LABEL[breakdown.overall]}</span>
      </div>
      <div className="space-y-2">
        {breakdown.categories.map((c) => (
          <div key={c.category} className="flex items-start justify-between gap-3 py-1">
            <div>
              <div className="text-sm text-slate-300">{c.category} Risk</div>
              <div className="text-xs text-slate-500">{c.reason}</div>
            </div>
            <span className={`text-sm font-semibold flex-shrink-0 ${LEVEL_STYLE[c.level]}`}>{LEVEL_LABEL[c.level]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
