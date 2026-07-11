'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';

interface Props {
  staleCount: number;
}

export function AdminScanJobRecovery({ staleCount }: Props) {
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<{ affected: number } | null>(null);
  const [error,    setError]    = useState('');

  async function handleRecovery() {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res  = await fetch('/api/admin/scan-jobs/mark-stale-failed', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
      } else {
        setResult(data);
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  const currentStale = result !== null ? result.affected : staleCount;
  const hasStale     = currentStale > 0;

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          hasStale ? 'bg-amber-500/10' : 'bg-slate-800'
        }`}>
          <RefreshCw className={`w-5 h-5 ${hasStale ? 'text-amber-400' : 'text-slate-500'}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-100">Scan Job Recovery</span>
            {hasStale ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400">
                {currentStale} stuck
              </span>
            ) : (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-700 text-slate-400">
                0 stuck
              </span>
            )}
          </div>

          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Only RUNNING or PENDING scan jobs older than 10 minutes are affected.
            Completed and already-failed jobs are not changed.
          </p>

          {result !== null && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              {result.affected > 0
                ? `${result.affected} stale job${result.affected === 1 ? '' : 's'} marked as failed.`
                : 'No stale jobs found — nothing changed.'}
            </div>
          )}

          {error && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <button
          onClick={handleRecovery}
          disabled={loading}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…</>
            : <><RefreshCw className="w-3.5 h-3.5" /> Mark stale jobs failed</>
          }
        </button>
      </div>
    </div>
  );
}
