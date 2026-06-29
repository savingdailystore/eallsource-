import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ConfidenceResult } from '@/types';

// Dumb presentation component — Feature 2 (full reasons + concerns).
// Same underlying signals as ConfidencePanel (Feature 1), just uncapped and
// split into "why recommended" vs "potential concerns".

export function ExplanationPanel({ result }: { result: ConfidenceResult }) {
  if (result.reasons.length === 0 && result.concerns.length === 0) return null;

  return (
    <div className="card p-5">
      {result.reasons.length > 0 && (
        <>
          <h2 className="font-semibold text-slate-50 mb-4">Why this is recommended</h2>
          <div className="space-y-1.5 mb-4">
            {result.reasons.map((reason, i) => (
              <div key={i} className="text-sm text-slate-300 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />{reason}
              </div>
            ))}
          </div>
        </>
      )}

      {result.concerns.length > 0 && (
        <>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Potential concerns</div>
          <div className="space-y-1.5">
            {result.concerns.map((concern, i) => (
              <div key={i} className="text-sm text-slate-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />{concern}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
