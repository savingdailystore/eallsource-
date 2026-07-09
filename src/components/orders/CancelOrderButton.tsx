'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Loader2 } from 'lucide-react';

export function CancelOrderButton({ poId }: { poId: string }) {
  const router = useRouter();
  const [loading, setLoading]   = useState(false);
  const [confirm, setConfirm]   = useState(false);
  const [error, setError]       = useState('');

  async function handleCancel() {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/purchase-orders/${poId}`, { method: 'DELETE' });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to cancel order.');
      setConfirm(false);
      return;
    }
    router.refresh();
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">Cancel this order?</span>
        <button
          onClick={handleCancel}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium flex items-center gap-1"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Yes, cancel
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white"
        >
          Keep
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="btn-secondary text-sm flex items-center gap-1.5 text-red-400 hover:text-red-300"
    >
      <Ban className="w-4 h-4" />
      Cancel Order
    </button>
  );
}
