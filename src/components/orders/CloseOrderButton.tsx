'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { XCircle, Loader2 } from 'lucide-react';

export function CloseOrderButton({ poId }: { poId: string }) {
  const router = useRouter();
  const [open, setOpen]           = useState(false);
  const [reason, setReason]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  async function handleClose() {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/purchase-orders/${poId}/close`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ closeReason: reason.trim() || undefined }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to close order.');
      return;
    }
    router.refresh();
  }

  if (open) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-800/60 p-4 w-full sm:max-w-sm text-sm">
        <p className="text-slate-200 font-medium">Close this order?</p>
        <p className="text-xs text-slate-400">
          This closes the purchase order without receiving inventory. Inventory quantities, unit cost, and
          sales profit will not change. Use this when items were consumed, sold, or handled outside app
          inventory tracking.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Close reason (optional)"
          rows={2}
          maxLength={2000}
          className="w-full rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs px-3 py-2 resize-none placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-white font-medium flex items-center gap-1"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Close order
          </button>
          <button
            onClick={() => { setOpen(false); setError(''); setReason(''); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white"
          >
            Keep open
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className="btn-secondary text-sm flex items-center gap-1.5 text-slate-400 hover:text-slate-300"
    >
      <XCircle className="w-4 h-4" />
      Close Order
    </button>
  );
}
