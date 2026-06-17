'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export function RunRuleButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy]     = useState(false);
  const [toast, setToast]   = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setToast(null);

    const res  = await fetch(`/api/repricing/rules/${id}`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (res.ok) {
      const r = data.data;
      setToast({ ok: true, text: `${r.direction} → ${formatCurrency(r.recommendedPrice)}` });
      router.refresh();
    } else {
      setToast({ ok: false, text: data.error ?? 'Run failed' });
    }

    setTimeout(() => setToast(null), 4000);
  }

  return (
    <span className="relative inline-flex items-center">
      <button onClick={run} disabled={busy} title="Run this rule now"
        className="p-1.5 rounded-lg text-slate-300 hover:text-green-600 hover:bg-green-50 transition-all">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
      </button>
      {toast && (
        <span className={`absolute right-full mr-1 whitespace-nowrap text-xs px-1.5 py-0.5 rounded ${
          toast.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
        }`}>
          {toast.text}
        </span>
      )}
    </span>
  );
}
