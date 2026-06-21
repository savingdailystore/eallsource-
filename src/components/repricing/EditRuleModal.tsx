'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SlidersHorizontal, X, Loader2 } from 'lucide-react';

interface Rule {
  id:         string;
  asin:       string;
  title:      string | null;
  minRoi:     number;
  minProfit:  number;
  strategy:   string;
  isActive:   boolean;
  floorPrice: number | null;
  costBasis:  number | null;
}

const STRATEGIES = [
  { value: 'COMPETITIVE', label: 'Competitive + Floor', desc: 'Chase the Buy Box (price 0.5% below it) but never drop below your floor — the higher of your manual floor price and your Min ROI floor.' },
  { value: 'FLOOR',       label: 'Floor only',          desc: 'Always sit at your floor price — the lowest price that still clears your floor / Min ROI.' },
  { value: 'CEILING',     label: 'Ceiling',             desc: 'Price at or slightly above the Buy Box to maximize margin.' },
];

export function EditRuleModal({ rule }: { rule: Rule }) {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const [form, setForm] = useState({
    strategy:   rule.strategy,
    minRoi:     String(rule.minRoi),
    minProfit:  String(rule.minProfit),
    floorPrice: rule.floorPrice != null ? String(rule.floorPrice) : '',
    costBasis:  rule.costBasis != null ? String(rule.costBasis) : '',
    isActive:   rule.isActive,
  });

  function close() { setOpen(false); setError(''); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch(`/api/repricing/rules/${rule.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy:   form.strategy,
        minRoi:     parseFloat(form.minRoi),
        minProfit:  parseFloat(form.minProfit),
        floorPrice: form.floorPrice.trim() === '' ? null : parseFloat(form.floorPrice),
        costBasis:  form.costBasis.trim()  === '' ? null : parseFloat(form.costBasis),
        isActive:   form.isActive,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to save changes.');
    } else {
      close();
      router.refresh();
    }
  }

  const activeStrategy = STRATEGIES.find((s) => s.value === form.strategy);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Customize rule"
        className="p-1.5 rounded-lg text-slate-600 hover:text-blue-500 hover:bg-blue-500/10 transition-all"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-slate-900 rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div>
                <h2 className="font-semibold text-slate-50">Customize Repricing Rule</h2>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{rule.asin}</p>
              </div>
              <button onClick={close} className="text-slate-500 hover:text-slate-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="label">Strategy</label>
                <select value={form.strategy} onChange={(e) => setForm((f) => ({ ...f, strategy: e.target.value }))} className="input">
                  {STRATEGIES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                {activeStrategy && <p className="text-xs text-slate-500 mt-1">{activeStrategy.desc}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Min ROI (%)</label>
                  <input value={form.minRoi} onChange={(e) => setForm((f) => ({ ...f, minRoi: e.target.value }))} type="number" step="1" min="0" max="500" required className="input" />
                </div>
                <div>
                  <label className="label">Min Profit ($)</label>
                  <input value={form.minProfit} onChange={(e) => setForm((f) => ({ ...f, minProfit: e.target.value }))} type="number" step="0.01" min="0" required className="input" />
                </div>
              </div>

              <div>
                <label className="label">Unit Cost ($) <span className="text-slate-500 font-normal">(what you paid)</span></label>
                <input
                  value={form.costBasis}
                  onChange={(e) => setForm((f) => ({ ...f, costBasis: e.target.value }))}
                  type="number" step="0.01" min="0" className="input"
                  placeholder="e.g. 14.50"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Your landed cost per unit. Required to compute the Min ROI / Min Profit floor. Without it, set a manual floor below or the rule is skipped.
                </p>
              </div>

              <div>
                <label className="label">Manual Floor Price ($) <span className="text-slate-500 font-normal">(optional)</span></label>
                <input
                  value={form.floorPrice}
                  onChange={(e) => setForm((f) => ({ ...f, floorPrice: e.target.value }))}
                  type="number" step="0.01" min="0" className="input"
                  placeholder="Leave blank to use Min ROI floor"
                />
                <p className="text-xs text-slate-500 mt-1">
                  A hard price the rule will never sell below. Effective floor = the higher of this and your Min ROI floor.
                </p>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-700 text-blue-500 focus:ring-blue-400"
                />
                <span className="text-sm text-slate-200">Rule active</span>
                <span className="text-xs text-slate-500">— inactive rules are skipped on Run All</span>
              </label>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={close} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={loading} className="btn-primary">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
