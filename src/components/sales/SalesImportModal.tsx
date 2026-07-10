'use client';

import { useState, useRef } from 'react';
import { Upload, X, CheckCircle2, AlertTriangle, Loader2, Info } from 'lucide-react';

interface ImportResult {
  imported:             number;
  created:              number;
  updated:              number;
  skipped:              number;
  currencySkipped:      number;
  parseErrors:          number;
  total:                number;
  syncId:               string;
  rowErrors?:           { rowIndex: number; message: string }[];
  currencySkippedNote?: string;
}

export function SalesImportModal() {
  const [open,   setOpen]   = useState(false);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
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
      const res  = await fetch('/api/sales/import', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setErrMsg(data?.error ?? `Upload failed (${res.status})`);
        setStatus('error');
        return;
      }
      setResult(data as ImportResult);
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
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
      >
        <Upload className="w-4 h-4" />
        Import Orders Report
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg mx-4 p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-100">Import Orders Report</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Upload the Amazon flat-file orders report (TSV or CSV)
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
                <li>Go to <span className="text-slate-200">Reports → Fulfillment</span></li>
                <li>Select <span className="text-slate-200">Amazon Fulfilled Shipments</span></li>
                <li>Set your date range and click <span className="text-slate-200">Request Report</span></li>
                <li>Download the <span className="text-slate-200">.txt or .tsv</span> flat file and upload it here</li>
              </ol>
              <p className="text-slate-500 pt-0.5">
                Accepted: Amazon Fulfilled Shipments flat file (.txt / .tsv) — tab-separated.
                Re-importing the same file is safe — existing records update in place, no duplicates created.
                If the report exceeds 5 MB, download a shorter date range.
              </p>
            </div>

            {/* Fee notice */}
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                The orders report contains order, quantity, and revenue data.
                It does <strong className="text-amber-200">not</strong> include final Amazon fees (referral fees, FBA fees).
                Gross profit before fees will be shown where unit cost is available.
                Import a settlement report afterwards to add exact fee data and unlock realized profit.
              </span>
            </div>

            {/* Drop zone */}
            {status === 'idle' && (
              <div
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl p-8 text-center cursor-pointer transition-colors"
              >
                <Upload className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Drop file here or click to browse</p>
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
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                <p className="text-sm text-slate-400">Parsing and importing...</p>
              </div>
            )}

            {status === 'done' && result && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-semibold">Import complete</span>
                </div>

                {/* Duplicate notice — shown prominently when nothing new was added */}
                {result.created === 0 && result.updated > 0 && (
                  <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300">
                    <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                      0 new records created — this file was already imported.{' '}
                      {result.updated} record{result.updated !== 1 ? 's were' : ' was'} updated in place.
                      No duplicate entries were added. Re-importing the same report is always safe.
                    </span>
                  </div>
                )}

                {/* Currency-skipped notice — shown when non-USD rows were dropped */}
                {result.currencySkipped > 0 && (
                  <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                      {result.currencySkipped} row{result.currencySkipped !== 1 ? 's were' : ' was'} skipped —
                      unsupported currency (non-USD). These rows were not imported to prevent storing
                      foreign currency amounts as if they were USD.
                    </span>
                  </div>
                )}

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Rows found',        value: result.total,            warn: false },
                    { label: 'New records',        value: result.created,          warn: false },
                    { label: 'Already imported',   value: result.updated,          warn: false },
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
                    { label: 'Skipped (cancelled/pending)', value: result.skipped,         warn: false },
                    { label: 'Skipped (non-USD currency)',  value: result.currencySkipped,  warn: result.currencySkipped > 0 },
                    { label: 'Parse errors',                value: result.parseErrors,      warn: result.parseErrors > 0 },
                  ].map((s) => (
                    <div key={s.label} className="bg-slate-800 rounded-xl p-3 text-center">
                      <div className={`text-xl font-bold ${s.warn ? 'text-amber-400' : 'text-slate-100'}`}>
                        {s.value}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>

                {result.rowErrors && result.rowErrors.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300 space-y-1">
                    <p className="font-semibold">First parse errors:</p>
                    {result.rowErrors.slice(0, 5).map((e, i) => (
                      <p key={i}>Row {e.rowIndex}: {e.message}</p>
                    ))}
                  </div>
                )}

                <p className="text-xs text-slate-500">
                  <strong className="text-slate-400">Skipped rows</strong> are Cancelled, Pending, or Unshipped orders —
                  they have no confirmed revenue and are intentionally excluded.
                  Non-USD orders are also excluded to prevent foreign currency amounts being stored as USD.
                  Each order line is matched by its unique order-item ID — re-importing updates records in place, no duplicates.
                </p>
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
