'use client';

import { useState, useRef } from 'react';
import { Upload, X, CheckCircle2, AlertTriangle, Loader2, Info, FileText } from 'lucide-react';

interface SettlementResult {
  rows:                     number;
  created:                  number;
  updated:                  number;
  orderRows:                number;
  refundRows:               number;
  unsupportedRows:          number;
  feeGroupsFound:           number;
  matched:                  number;
  unmatched:                number;
  parseErrors:              number;
  syncId:                   string;
  remainingMissingFeesCount?: number;
  rowErrors?:               { rowIndex: number; message: string }[];
}

export function SalesSettlementModal() {
  const [open,   setOpen]   = useState(false);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<SettlementResult | null>(null);
  const [errMsg, setErrMsg] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStatus('idle');
    setResult(null);
    setErrMsg('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleFile(file: File) {
    setStatus('uploading');
    setResult(null);
    setErrMsg('');

    const form = new FormData();
    form.append('file', file);

    try {
      const res  = await fetch('/api/sales/settlement', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setErrMsg(data?.error ?? `Upload failed (${res.status})`);
        setStatus('error');
        return;
      }
      setResult(data as SettlementResult);
      setStatus('done');
    } catch {
      setErrMsg('Network error — please try again.');
      setStatus('error');
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <>
      <button
        onClick={() => { reset(); setOpen(true); }}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
      >
        <FileText className="w-4 h-4" />
        Import Settlement Report
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg mx-4 p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-100">Import Settlement Report</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Settlement reports add Amazon referral and FBA fees and unlock realized profit when unit cost is also present.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Download instructions */}
            <div className="bg-slate-800/60 rounded-xl p-4 text-xs text-slate-400 space-y-1.5">
              <p className="font-semibold text-slate-300">How to download from Seller Central:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Go to <span className="text-slate-200">Reports → Payments</span></li>
                <li>Select <span className="text-slate-200">All Statements</span></li>
                <li>Click <span className="text-slate-200">Download</span> next to the settlement period</li>
                <li>Choose the <span className="text-slate-200">flat file (.txt)</span> format — not the PDF or summary</li>
                <li>Upload the file here</li>
              </ol>
              <p className="text-slate-500 pt-0.5">
                Accepted: Settlement flat file (.txt) — V1 and V2 formats are both supported.
                One file covers one settlement period (roughly two weeks).
                Import a separate file for each period that has unmatched orders.
              </p>
            </div>

            {/* Fee-matching notice */}
            <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-300">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                Fees are matched by order item ID. Import the orders report first, then import the settlement
                report. Re-importing the same file is safe — fees will be overwritten, not doubled.
              </span>
            </div>

            {/* Drop zone */}
            {status === 'idle' && (
              <div
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-xl p-8 text-center cursor-pointer transition-colors"
              >
                <Upload className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Drop settlement file here or click to browse</p>
                <p className="text-xs text-slate-600 mt-1">TSV or CSV — max 5 MB</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.tsv,.csv"
                  className="hidden"
                  onChange={onFileChange}
                />
              </div>
            )}

            {status === 'uploading' && (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                <p className="text-sm text-slate-400">Parsing and applying fees...</p>
              </div>
            )}

            {status === 'done' && result && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-semibold">Settlement imported</span>
                </div>

                {result.updated > 0 && result.created === 0 && (
                  <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300">
                    <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                      This settlement was already imported. {result.updated} row{result.updated !== 1 ? 's' : ''} updated
                      in place — fees were overwritten, not added again.
                    </span>
                  </div>
                )}

                {result.matched > 0 && result.unmatched === 0 && (
                  <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-300">
                    <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                      All matched fee groups were applied. Realized profit was updated where cost is available.
                    </span>
                  </div>
                )}

                {result.unmatched > 0 && (
                  <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                      {result.unmatched} fee group{result.unmatched !== 1 ? 's' : ''} did not match any order records.
                      These may belong to orders not yet imported or orders outside your current Sales data.
                      Import the matching orders report, then re-import this settlement file.
                    </span>
                  </div>
                )}

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Total rows',      value: result.rows },
                    { label: 'New records',      value: result.created },
                    { label: 'Already imported', value: result.updated },
                  ].map((s) => (
                    <div key={s.label} className="bg-slate-800 rounded-xl p-3 text-center">
                      <div className="text-xl font-bold text-slate-100">{s.value}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Order rows',     value: result.orderRows },
                    { label: 'Fees matched',   value: result.matched,   warn: false },
                    { label: 'Fees unmatched', value: result.unmatched, warn: result.unmatched > 0 },
                  ].map((s) => (
                    <div key={s.label} className="bg-slate-800 rounded-xl p-3 text-center">
                      <div className={`text-xl font-bold ${s.warn ? 'text-amber-400' : 'text-slate-100'}`}>
                        {s.value}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Refund rows',       value: result.refundRows },
                    { label: 'Adjustment rows',   value: result.unsupportedRows },
                    { label: 'Parse errors',      value: result.parseErrors, warn: result.parseErrors > 0 },
                  ].map((s) => (
                    <div key={s.label} className="bg-slate-800 rounded-xl p-3 text-center">
                      <div className={`text-xl font-bold ${s.warn ? 'text-amber-400' : 'text-slate-100'}`}>
                        {s.value}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Row-type definitions */}
                <p className="text-xs text-slate-500 leading-relaxed">
                  <strong className="text-slate-400">Order rows</strong> are settlement transaction lines for shipped orders (not purchase orders).{' '}
                  <strong className="text-slate-400">Refund rows</strong> are buyer return credits in the settlement data.{' '}
                  <strong className="text-slate-400">Adjustment rows</strong> are account-level charges or credits that may need separate review.
                  If orders show fees unmatched, the order may belong to a different settlement period — import the corresponding settlement file to cover it.
                </p>

                {/* Stored-but-not-applied notice */}
                {(result.refundRows > 0 || result.unsupportedRows > 0) && (
                  <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-3 py-2.5 text-xs text-slate-400 space-y-1">
                    {result.refundRows > 0 && (
                      <p>
                        <strong className="text-slate-300">{result.refundRows} refund row{result.refundRows !== 1 ? 's were' : ' was'}</strong>{' '}
                        stored for review but not applied to realized profit.{' '}
                        Go to <strong className="text-slate-300">Sales → Review refund rows</strong> to create adjustment records.
                      </p>
                    )}
                    {result.unsupportedRows > 0 && (
                      <p>
                        <strong className="text-slate-300">{result.unsupportedRows} adjustment/service/transfer row{result.unsupportedRows !== 1 ? 's were' : ' was'}</strong>{' '}
                        stored but not applied to sale-level profit.
                      </p>
                    )}
                  </div>
                )}

                {result.remainingMissingFeesCount != null && (
                  <p className="text-xs text-slate-500 text-center">
                    Rows still missing settlement fees after this import:{' '}
                    <span className={result.remainingMissingFeesCount === 0 ? 'text-emerald-400' : 'text-amber-400'}>
                      {result.remainingMissingFeesCount}
                    </span>
                  </p>
                )}

                {result.rowErrors && result.rowErrors.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300 space-y-1">
                    <p className="font-semibold">First parse errors:</p>
                    {result.rowErrors.slice(0, 5).map((e, i) => (
                      <p key={i}>Row {e.rowIndex}: {e.message}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {status === 'error' && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{errMsg}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              {(status === 'done' || status === 'error') && (
                <button onClick={reset} className="px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
                  Import another
                </button>
              )}
              <button
                onClick={() => { setOpen(false); if (status === 'done') window.location.reload(); }}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                {status === 'done' ? 'Done' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
