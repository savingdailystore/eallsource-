import { Star, Sparkles } from 'lucide-react';
import type { ConfidenceResult } from '@/types';

// Dumb presentation component — all judgment happens in engines/confidence.ts.
// Renders Feature 1 (confidence/stars/recommendation/primary reasons).

const RECOMMENDATION_TONE: Record<ConfidenceResult['recommendation'], string> = {
  'Excellent Buy': 'text-green-400',
  'Strong Buy':    'text-green-400',
  'Good Buy':      'text-blue-400',
  'Risky':         'text-amber-400',
  'Avoid':         'text-red-400',
};

export function ConfidencePanel({ result }: { result: ConfidenceResult }) {
  const tone = RECOMMENDATION_TONE[result.recommendation];

  return (
    <div className="card p-5">
      <h2 className="font-semibold text-slate-50 mb-4 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-blue-400" />AI Confidence
      </h2>

      <div className="flex items-center gap-5 mb-4">
        <div className={`text-3xl font-black ${tone}`}>{result.confidence}%</div>
        <div>
          <div className="flex items-center gap-0.5" role="img" aria-label={`${result.stars} out of 5 stars`}>
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} aria-hidden="true" className={`w-4 h-4 ${i < result.stars ? `${tone} fill-current` : 'text-slate-700'}`} />
            ))}
          </div>
          <div className={`text-sm font-bold mt-0.5 ${tone}`}>{result.recommendation}</div>
        </div>
      </div>

      {result.primaryReasons.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Primary reasons</div>
          {result.primaryReasons.map((reason, i) => (
            <div key={i} className="text-sm text-slate-300 flex items-start gap-2">
              <span className="text-green-400 mt-0.5">✓</span>{reason}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
