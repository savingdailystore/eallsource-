'use client';

import { useState } from 'react';
import { X, Loader2, AlertTriangle, CheckCircle2, Info, FileSearch } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

// ─── API response shapes ──────────────────────────────────────────────────────

interface PreviewSampleRow {
  orderItemCode:   string;
  saleRecordId:    string;
  classifications: {
    adjustmentType: string;
    amountCategory: string | null;
    amount:         number | null;
    profitImpact:   number | null;
  }[];
}

interface PreviewResponse {
  totalRefundRows: number;
  itemLevelRows:   number;
  orderLevelRows:  number;
  matchedCount:    number;
  unmatchedCount:  number;
  skippedCount:    number;
  sampleRows:      PreviewSampleRow[];
  warnings:        string[];
  message?:        string;
}

interface ApplyResponse {
  totalRefundRows:           number;
  createdCount:              number;
  skippedCount:              number;
  alreadyExistsCount:        number;
  orderLevelSkippedCount:    number;
  unmatchedSkippedCount:     number;
  unsupportedSkippedCount:   number;
  invalidAmountSkippedCount: number;
  message?:                  string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  return formatCurrency(v);
}

function fmtType(t: string): string {
  switch (t) {
    case 'PRINCIPAL_REFUND': return 'Principal refund';
    case 'TAX_REFUND':       return 'Tax refund';
    case 'FEE_CREDIT':       return 'Fee credit';
    case 'RETURN_FEE':       return 'Return fee';
    default:                 return t;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBox({ label, value, warn = false, neutral = false }: {
  label: string; value: number | string; warn?: boolean; neutral?: boolean;
}) {
  const color = warn ? 'text-amber-400' : neutral ? 'text-slate-400' : 'text-slate-100';
  return (
    <div className="bg-slate-800 rounded-xl p-3 text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function AuditDisclaimer() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2.5 text-xs text-blue-300">
      <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      <span>
        These records are an audit trail only. They do not change realized profit,
        adjustedProfit, or any sale record. Profit formulas are unchanged.
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Step = 'idle' | 'loading' | 'preview' | 'applying' | 'done' | 'error';

export function RefundAdjustmentModal({ refundRowsCount }: { refundRowsCount: number }) {
  const [open,    setOpen]    = useState(false);
  const [step,    setStep]    = useState<Step>('idle');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result,  setResult]  = useState<ApplyResponse | null>(null);
  const [errMsg,  setErrMsg]  = useState('');

  if (refundRowsCount <= 0) return null;

  function close() {
    setOpen(false);
    setStep('idle');
    setPreview(null);
    setResult(null);
    setErrMsg('');
  }

  async function openModal() {
    setOpen(true);
    setStep('loading');
    setPreview(null);
    setResult(null);
    setErrMsg('');

    try {
      const res  = await fetch('/api/sales/refunds/preview', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      });
      const data = await res.json() as PreviewResponse;
      if (!res.ok) {
        const status = res.status;
        if (status === 401 || status === 403) {
          setErrMsg('You do not have permission to view refund data.');
        } else {
          setErrMsg('Could not load refund preview. Try again.');
        }
        setStep('error');
        return;
      }
      setPreview(data);
      setStep('preview');
    } catch {
      setErrMsg('Could not load refund preview. Try again.');
      setStep('error');
    }
  }

  async function handleApply() {
    setStep('applying');
    setErrMsg('');

    try {
      const res  = await fetch('/api/sales/refunds/apply', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ confirmed: true }),
      });
      const data = await res.json() as ApplyResponse;
      if (!res.ok) {
        setErrMsg('Could not create adjustment records. No profit values were changed.');
        setStep('error');
        return;
      }
      setResult(data);
      setStep('done');
    } catch {
      setErrMsg('Could not create adjustment records. No profit values were changed.');
      setStep('error');
    }
  }

  const confirmDisabled =
    step === 'applying' ||
    !preview ||
    preview.matchedCount <= 0;

  return (
    <>
      <button
        onClick={openModal}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-slate-100 bg-slate-700/60 hover:bg-slate-700 border border-slate-600 px-3 py-1.5 rounded-lg transition-colors"
      >
        <FileSearch className="w-3.5 h-3.5" />
        Review refund rows
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
        >
          <div className="bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
              <div>
                <h2 className="font-semibold text-slate-50">Review Refund Adjustment Records</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Stored refund rows can be saved as adjustment records for your audit trail.
                  Realized profit will not change.
                </p>
              </div>
              <button
                onClick={close}
                className="text-slate-500 hover:text-slate-300 transition-colors ml-4 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

              {/* Loading */}
              {step === 'loading' && (
                <div className="flex items-center justify-center py-12 gap-3 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading refund row preview…</span>
                </div>
              )}

              {/* Error */}
              {step === 'error' && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-300">{errMsg}</p>
                  </div>
                </div>
              )}

              {/* Preview */}
              {step === 'preview' && preview && (
                <>
                  {/* Zero rows */}
                  {preview.totalRefundRows === 0 && (
                    <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-6 text-center">
                      <p className="text-sm text-slate-400">
                        {preview.message ?? 'No refund rows found in imported settlements.'}
                      </p>
                    </div>
                  )}

                  {/* Has rows */}
                  {preview.totalRefundRows > 0 && (
                    <>
                      {/* Counts grid */}
                      <div className="grid grid-cols-3 gap-2">
                        <StatBox label="Total refund rows"      value={preview.totalRefundRows} />
                        <StatBox label="Item-level rows"        value={preview.itemLevelRows} />
                        <StatBox label="Order-level (skipped)"  value={preview.orderLevelRows} neutral />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <StatBox label="Matched to sale record" value={preview.matchedCount} />
                        <StatBox
                          label="Unmatched (no sale record)"
                          value={preview.unmatchedCount}
                          warn={preview.unmatchedCount > 0}
                          neutral={preview.unmatchedCount === 0}
                        />
                        <StatBox label="Skipped (other)"       value={preview.skippedCount} neutral />
                      </div>

                      {/* No matches guidance */}
                      {preview.matchedCount === 0 && (
                        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                          <p className="text-xs text-amber-200">
                            No refund rows could be matched to sale records.
                            Make sure the orders report for the same period has been imported first,
                            then re-import the settlement file.
                          </p>
                        </div>
                      )}

                      {/* Warnings */}
                      {preview.warnings.map((w, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-3 flex items-start gap-2"
                        >
                          <Info className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                          <p className="text-xs text-slate-400">{w}</p>
                        </div>
                      ))}

                      {/* Sample rows */}
                      {preview.sampleRows.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            Sample matched rows ({Math.min(preview.sampleRows.length, 10)} of {preview.matchedCount})
                          </p>
                          <div className="rounded-xl overflow-hidden border border-slate-800">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-800/60 text-slate-400">
                                  <th className="text-left px-3 py-2 font-medium">Order Item</th>
                                  <th className="text-left px-3 py-2 font-medium">Type</th>
                                  <th className="text-right px-3 py-2 font-medium">Amount</th>
                                  <th className="text-right px-3 py-2 font-medium">Profit impact</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60">
                                {preview.sampleRows.flatMap((row) =>
                                  row.classifications.map((c, ci) => (
                                    <tr key={`${row.orderItemCode}-${ci}`} className="text-slate-300">
                                      <td className="px-3 py-2 font-mono text-slate-400 text-[11px]">
                                        {ci === 0 ? row.orderItemCode : ''}
                                      </td>
                                      <td className="px-3 py-2">{fmtType(c.adjustmentType)}</td>
                                      <td className="px-3 py-2 text-right">{fmt(c.amount)}</td>
                                      <td className={`px-3 py-2 text-right ${c.profitImpact != null && c.profitImpact < 0 ? 'text-red-400' : 'text-slate-300'}`}>
                                        {fmt(c.profitImpact)}
                                        <span className="text-slate-600 text-[9px] ml-0.5">*</span>
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1.5">
                            * Profit impact is stored on the adjustment record only.
                            Realized profit in sale records is not changed.
                          </p>
                        </div>
                      )}

                      {/* Audit disclaimer */}
                      <AuditDisclaimer />
                    </>
                  )}
                </>
              )}

              {/* Applying */}
              {step === 'applying' && (
                <div className="flex items-center justify-center py-12 gap-3 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Creating adjustment records…</span>
                </div>
              )}

              {/* Done */}
              {step === 'done' && result && (
                <div className="space-y-3">
                  {result.createdCount > 0 ? (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-4 flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-emerald-300">
                          {result.createdCount} adjustment record{result.createdCount !== 1 ? 's' : ''} created.
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Realized profit is unchanged.
                          Adjustment records are stored with appliedToProfit = false.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-4 flex items-start gap-3">
                      <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-slate-300">
                          {result.alreadyExistsCount > 0
                            ? 'No new adjustment records were created. Existing records were skipped.'
                            : (result.message ?? 'No adjustment records were created.')}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Realized profit is unchanged.</p>
                      </div>
                    </div>
                  )}

                  {/* Counts breakdown */}
                  <div className="grid grid-cols-3 gap-2">
                    <StatBox label="Created"        value={result.createdCount} />
                    <StatBox label="Already existed" value={result.alreadyExistsCount} neutral />
                    <StatBox label="Skipped (total)" value={result.skippedCount}        neutral />
                  </div>

                  {(result.orderLevelSkippedCount > 0 ||
                    result.unmatchedSkippedCount > 0 ||
                    result.unsupportedSkippedCount > 0 ||
                    result.invalidAmountSkippedCount > 0) && (
                    <div className="rounded-xl bg-slate-800/40 border border-slate-700/60 px-4 py-3 text-xs text-slate-400 space-y-1">
                      <p className="font-medium text-slate-300">Skip breakdown</p>
                      {result.orderLevelSkippedCount    > 0 && <p>Order-level rows (no item code): {result.orderLevelSkippedCount}</p>}
                      {result.unmatchedSkippedCount     > 0 && <p>No matching sale record: {result.unmatchedSkippedCount}</p>}
                      {result.unsupportedSkippedCount   > 0 && <p>Unsupported row type: {result.unsupportedSkippedCount}</p>}
                      {result.invalidAmountSkippedCount > 0 && <p>Invalid amount (null or non-finite): {result.invalidAmountSkippedCount}</p>}
                    </div>
                  )}
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
                  {preview && preview.totalRefundRows > 0 && (
                    <button
                      onClick={handleApply}
                      disabled={confirmDisabled}
                      className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Create adjustment records
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
