'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

export function RunAllButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<{ ok: boolean; message: string } | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);

    const res  = await fetch('/api/repricing/run-all', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (res.ok) {
      const parts: string[] = [];
      if (data.created)  parts.push(`${data.created} rule${data.created === 1 ? '' : 's'} created`);
      if (data.repriced) parts.push(`${data.repriced} repriced`);
      if (data.skipped)  parts.push(`${data.skipped} skipped (no price data)`);
      setResult({ ok: true, message: parts.length ? parts.join(' · ') : 'Nothing to reprice yet.' });
      router.refresh();
    } else {
      setResult({ ok: false, message: data.error ?? 'Run failed. Please try again.' });
    }
  }

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className={`flex items-center gap-1.5 text-xs ${result.ok ? 'text-green-400' : 'text-red-400'}`}>
          {result.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {result.message}
        </span>
      )}
      <button onClick={run} disabled={loading} className="btn-primary text-sm">
        {loading
          ? <><Loader2 className="w-4 h-4 animate-spin" />Running…</>
          : <><RefreshCw className="w-4 h-4" />Run All Now</>}
      </button>
    </div>
  );
}
