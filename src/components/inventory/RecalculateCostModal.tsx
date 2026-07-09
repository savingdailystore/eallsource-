'use client';

import { useState }         from 'react';
import { useRouter }        from 'next/navigation';
import { X, Loader2, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { formatCurrency }   from '@/lib/utils';

interface SampleRow {
  id:                      string;
  sku:                     string | null;
  productName:             string | null;
  saleDate:                string;
  quantitySold:            number;
  netRevenue:              number;
  totalFees:               number | null;
  projectedCogs:           number | null;
  projectedGrossProfit:    number | null;
  projectedRealizedProfit: number | null;
  projectedRoi:            number | null;
}

interface PreviewData {
  sku:               string;
  inventoryUnitCost: number;
  eligibleCount:     number;
  skippedCount:      number;
  totalRecords:      number;
  sampleRows:        SampleRow[];
  warnings:          string[];
}

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  return formatCurrency(v);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toFixed(1)}%`;
}

export function RecalculateCostModal({ sku, unitCost }: { sku: string; unitCost: number }) {
  const router = useRouter();
  const [open,        setOpen]        = useState(false);
  const [step,        setStep]        = useState<'idle' | 'loading' | 'preview' | 'applying' | 'done' | 'error'>('idle');
  const [preview,     setPreview]     = useState<PreviewData | null>(null);
  const [errorMsg,    setErrorMsg]    = useState('');
  const [updatedCount, setUpdatedCount] = useState(0);

  function close() {
    setOpen(false);
    setStep('idle');
    setPreview(null);
    setErrorMsg('');
  }

  async function loadPreview() {
    setOpen(true);
    setStep('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/sales/recalculate-costs/preview', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sku }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Preview failed.');
        setStep('error');
        return;
      }
      setPreview(data as PreviewData);
      setStep('preview');
    } catch {
      setErrorMsg('Network error — could not load preview.');
      setStep('error');
    }
  }

  async function handleApply() {
    setStep('applying');
    setErrorMsg('');

    try {
      const res = await fetch('/api/sales/recalculate-costs/apply', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sku, confirmed: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Apply failed.');
        setStep('error');
        return;
      }
      setUpdatedCount((data as { updatedCount: number }).updatedCount);
      setStep('done');
      router.refresh();
    } catch {
      setErrorMsg('Network error — could not apply cost.');
      setStep('error');
    }
  }

  const hasFeeGapWarning = preview?.warnings.some((w) => w.includes('missing settlement fees'));

  return (
    <>
      <button
        onClick={loadPreview}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors"
      >
        Apply cost to past sales
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
              <h2 className="font-semibold text-slate-50">Apply cost to past sales</h2>
              <button onClick={close} className="text-slate-500 hover:text-slate-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

              {/* Loading */}
              {step === 'loading' && (
                <div className="flex items-center justify-center py-12 gap-3 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading preview…</span>
                </div>
              )}

              {/* Error */}
              {step === 'error' && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-300">{errorMsg}</p>
                  </div>
                </div>
              )}

              {/* Preview */}
              {step === 'preview' && preview && (
                <>
                  {/* Context */}
                  <div className="rounded-xl bg-slate-800/60 px-4 py-3 space-y-1 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">SKU</span>
                      <span className="font-mono text-slate-200">{preview.sku}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Current inventory unit cost</span>
                      <span className="font-semibold text-slate-100">{fmt(preview.inventoryUnitCost)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Total records for this SKU</span>
                      <span className="text-slate-300">{preview.totalRecords}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Eligible for cost fill</span>
                      <span className={preview.eligibleCount > 0 ? 'text-blue-300 font-medium' : 'text-slate-500'}>
                        {preview.eligibleCount}
                      </span>
                    </div>
                    {preview.skippedCount > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Skipped (already have cost)</span>
                        <span className="text-slate-500">{preview.skippedCount}</span>
                      </div>
                    )}
                  </div>

                  {/* Zero eligible */}
                  {preview.eligibleCount === 0 && (
                    <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-4 text-center">
                      <p className="text-sm text-slate-400">No past sales for this SKU are currently missing cost.</p>
                      <p className="text-xs text-slate-500 mt-1">Nothing to apply.</p>
                    </div>
                  )}

                  {/* Warnings */}
                  {preview.warnings.map((w, i) => (
                    <div key={i} className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 flex items-start gap-2">
                      <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-200">{w}</p>
                    </div>
                  ))}

                  {/* Sample rows */}
                  {preview.sampleRows.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Sample affected records ({Math.min(preview.sampleRows.length, 5)} of {preview.eligibleCount})
                      </p>
                      <div className="rounded-xl overflow-hidden border border-slate-800">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-800/60 text-slate-400">
                              <th className="text-left px-3 py-2 font-medium">Date</th>
                              <th className="text-right px-3 py-2 font-medium">Qty</th>
                              <th className="text-right px-3 py-2 font-medium">Net Rev</th>
                              <th className="text-right px-3 py-2 font-medium">COGS</th>
                              <th className="text-right px-3 py-2 font-medium">Gross profit</th>
                              <th className="text-right px-3 py-2 font-medium">Realized</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {preview.sampleRows.map((r) => (
                              <tr key={r.id} className="text-slate-300">
                                <td className="px-3 py-2 text-slate-400">
                                  {new Date(r.saleDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </td>
                                <td className="px-3 py-2 text-right">{r.quantitySold}</td>
                                <td className="px-3 py-2 text-right">{fmt(r.netRevenue)}</td>
                                <td className="px-3 py-2 text-right text-slate-400">{fmt(r.projectedCogs)}</td>
                                <td className="px-3 py-2 text-right text-amber-400">
                                  {fmt(r.projectedGrossProfit)}
                                  <span className="text-slate-600 text-[9px] ml-0.5">*</span>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {r.totalFees != null
                                    ? <span className={r.projectedRealizedProfit != null && r.projectedRealizedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>{fmt(r.projectedRealizedProfit)}</span>
                                    : <span className="text-slate-600">no fees</span>
                                  }
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {hasFeeGapWarning && (
                        <p className="text-[10px] text-slate-500 mt-1.5">
                          * Gross profit is before Amazon fees. Realized profit requires a settlement report.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Applying */}
              {step === 'applying' && (
                <div className="flex items-center justify-center py-12 gap-3 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Applying cost…</span>
                </div>
              )}

              {/* Done */}
              {step === 'done' && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-4 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-emerald-300">
                        Cost applied to {updatedCount} sale record{updatedCount !== 1 ? 's' : ''}.
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Rows without settlement fees will show Gross only until you import the
                        matching settlement report from Reports → Payments.
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 text-center">
                    Go to Sales → Missing fees tab to import settlement data for these records.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3 shrink-0">
              {step === 'done' || step === 'error' ? (
                <button onClick={close} className="btn-primary">Close</button>
              ) : step === 'preview' ? (
                <>
                  <button onClick={close} className="btn-secondary">Cancel</button>
                  {preview && preview.eligibleCount > 0 && (
                    <button onClick={handleApply} className="btn-primary">
                      Apply cost to {preview.eligibleCount} record{preview.eligibleCount !== 1 ? 's' : ''}
                    </button>
                  )}
                </>
              ) : (
                <button onClick={close} className="btn-secondary">Cancel</button>
              )}
            </div>

          </div>
        </div>
      )}
    </>
  );
}
