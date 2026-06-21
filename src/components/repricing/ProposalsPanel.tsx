'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, ArrowDown, Loader2, UploadCloud, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export interface Proposal {
  id:               string;
  asin:             string;
  title:            string | null;
  previousPrice:    number | null;
  recommendedPrice: number;
  direction:        string;
  riskScore:        number;
  sku:              string | null;
  buyBoxPrice:      number | null;
}

export function ProposalsPanel({ proposals }: { proposals: Proposal[] }) {
  const router = useRouter();
  const [busy, setBusy]     = useState<Set<string>>(new Set());
  const [allBusy, setAllBusy] = useState(false);
  const [msg, setMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  const pushable = proposals.filter((p) => p.sku);

  async function act(historyIds: string[], action: 'push' | 'reject') {
    if (historyIds.length === 0) return;
    if (action === 'push') {
      const verb = historyIds.length === 1 ? 'this price' : `${historyIds.length} prices`;
      if (!confirm(`Push ${verb} live to your Amazon listing${historyIds.length === 1 ? '' : 's'}? This changes what customers pay.`)) return;
    }
    setMsg(null);
    if (historyIds.length > 1) setAllBusy(true);
    else setBusy((s) => new Set(s).add(historyIds[0]));

    try {
      const res  = await fetch('/api/repricing/push', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ historyIds, action }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? 'Request failed.' });
      } else if (action === 'reject') {
        setMsg({ ok: true, text: `Dismissed ${data.rejected} proposal${data.rejected === 1 ? '' : 's'}.` });
      } else {
        const failed = data.failed ?? 0;
        setMsg({
          ok: failed === 0,
          text: failed === 0
            ? `Pushed ${data.pushed} price${data.pushed === 1 ? '' : 's'} to Amazon.`
            : `Pushed ${data.pushed}, ${failed} failed — ${data.results?.find((r: any) => !r.ok)?.error ?? 'see details'}.`,
        });
      }
      router.refresh();
    } catch {
      setMsg({ ok: false, text: 'Request failed.' });
    } finally {
      setAllBusy(false);
      setBusy(new Set());
    }
  }

  if (proposals.length === 0) return null;

  return (
    <div className="card overflow-hidden border-blue-500/30">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-slate-50">Pending Price Changes</h2>
          <span className="badge bg-blue-500/15 text-blue-300 text-xs">{proposals.length}</span>
        </div>
        <button
          onClick={() => act(pushable.map((p) => p.id), 'push')}
          disabled={allBusy || pushable.length === 0}
          className="btn-primary text-xs py-1.5"
          title={pushable.length === 0 ? 'No proposals have a synced SKU to push' : 'Push all proposals with a known SKU'}
        >
          {allBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
          Push all ({pushable.length})
        </button>
      </div>

      {msg && (
        <div className={`px-5 py-2 text-xs flex items-center gap-1.5 ${msg.ok ? 'text-green-400 bg-green-500/5' : 'text-red-400 bg-red-500/5'}`}>
          {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {msg.text}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-800/40">
              {['Product', 'Buy Box', 'Current', '', 'New Price', 'Risk', ''].map((h, i) => (
                <th key={h || i} className="table-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {proposals.map((p) => {
              const up   = p.direction === 'UP';
              const Arrow = up ? ArrowUp : ArrowDown;
              const rowBusy = busy.has(p.id) || allBusy;
              return (
                <tr key={p.id} className="hover:bg-slate-800/40">
                  <td className="table-td">
                    <div className="font-medium text-slate-50 max-w-xs truncate">{p.title ?? p.asin}</div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {p.asin}{p.sku ? ` · ${p.sku}` : ' · no SKU'}
                    </div>
                  </td>
                  <td className="table-td text-slate-300">{p.buyBoxPrice != null ? formatCurrency(p.buyBoxPrice) : '—'}</td>
                  <td className="table-td text-slate-400">{p.previousPrice != null ? formatCurrency(p.previousPrice) : '—'}</td>
                  <td className="table-td">
                    <Arrow className={`w-4 h-4 ${up ? 'text-green-400' : 'text-red-400'}`} />
                  </td>
                  <td className="table-td font-semibold text-slate-50">{formatCurrency(p.recommendedPrice)}</td>
                  <td className="table-td">
                    <span className={`text-xs ${p.riskScore >= 60 ? 'text-amber-400' : 'text-slate-400'}`}>{p.riskScore.toFixed(0)}</span>
                  </td>
                  <td className="table-td">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => act([p.id], 'push')}
                        disabled={rowBusy || !p.sku}
                        className="btn-primary text-xs py-1 px-2.5"
                        title={!p.sku ? 'No synced SKU — sync your Amazon inventory first' : 'Push this price to Amazon'}
                      >
                        {busy.has(p.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <UploadCloud className="w-3 h-3" />}
                        Push
                      </button>
                      <button
                        onClick={() => act([p.id], 'reject')}
                        disabled={rowBusy}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1"
                        title="Dismiss this proposal"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
