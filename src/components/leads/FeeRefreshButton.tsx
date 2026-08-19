'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

interface FeeRefreshButtonProps {
  leadId: string;
}

type RefreshStatus =
  | 'REFRESHED'
  | 'REFRESHED_FEES_ONLY'
  | 'SP_API_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'ERROR';

function statusMessage(status: RefreshStatus): { text: string; cls: string } {
  switch (status) {
    case 'REFRESHED':
      return { text: 'Fees and profitability updated.', cls: 'text-green-400' };
    case 'REFRESHED_FEES_ONLY':
      return { text: 'Fees updated. Source price missing — profit not recalculated.', cls: 'text-amber-400' };
    case 'SP_API_UNAVAILABLE':
      return { text: 'Amazon fee service unavailable. Try again later.', cls: 'text-slate-400' };
    case 'RATE_LIMITED':
      return { text: 'Too many refresh requests. Try again later.', cls: 'text-orange-400' };
    case 'ERROR':
      return { text: 'Refresh failed. Try again.', cls: 'text-red-400' };
  }
}

export function FeeRefreshButton({ leadId }: FeeRefreshButtonProps) {
  const router = useRouter();
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<RefreshStatus | null>(null);

  async function handleRefresh() {
    if (loading) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/leads/${leadId}/refresh-fees`, { method: 'POST' });

      if (res.status === 429) {
        setResult('RATE_LIMITED');
        return;
      }

      if (!res.ok) {
        setResult('ERROR');
        return;
      }

      const data = await res.json() as { ok?: boolean; status?: string };
      const status = data.status as RefreshStatus | undefined;

      if (status === 'REFRESHED' || status === 'REFRESHED_FEES_ONLY') {
        setResult(status);
        router.refresh();
      } else if (status === 'SP_API_UNAVAILABLE') {
        setResult('SP_API_UNAVAILABLE');
      } else {
        setResult('ERROR');
      }
    } catch {
      setResult('ERROR');
    } finally {
      setLoading(false);
    }
  }

  const msg = result ? statusMessage(result) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="btn-secondary text-xs py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Refreshing…' : 'Refresh Amazon Fees'}
        </button>
        {msg && (
          <span className={`text-xs ${msg.cls}`}>{msg.text}</span>
        )}
      </div>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        Refresh uses the current stored Amazon price and may update displayed profit and ROI. It does not refresh buy box price.
      </p>
    </div>
  );
}
