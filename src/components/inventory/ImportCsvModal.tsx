'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X, Loader2, FileText, Download, CheckCircle2, AlertTriangle } from 'lucide-react';

const TEMPLATE =
  'asin,title,retailer,costBasis,quantity,listedPrice,purchaseDate,status\n' +
  'B08N5WRWNW,Example Product,Walmart,12.50,3,29.99,2026-06-01,IN_STOCK\n';

export function ImportCsvModal() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen]       = useState(false);
  const [fileName, setFile]   = useState('');
  const [csvText, setCsvText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<{ ok: boolean; message: string } | null>(null);

  function close() { setOpen(false); setResult(null); setFile(''); setCsvText(''); }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFile(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = 'inventory-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!csvText) return;
    setLoading(true);
    setResult(null);

    const res  = await fetch('/api/inventory/import', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ csv: csvText }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (res.ok) {
      const parts = [`${data.imported} imported`];
      if (data.skipped) parts.push(`${data.skipped} skipped`);
      setResult({ ok: true, message: parts.join(' · ') });
      router.refresh();
    } else {
      setResult({ ok: false, message: data.error ?? 'Import failed.' });
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary text-sm">
        <Upload className="w-4 h-4" />Import CSV
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Import Inventory from CSV</h2>
              <button onClick={close} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-500">
                Upload a CSV with your inventory. The only required column is <span className="font-mono text-slate-700">asin</span>.
                Recognized columns: <span className="font-mono text-xs">asin, title, retailer, costBasis, quantity, listedPrice, purchaseDate, status</span>.
                Rows with an existing ASIN are updated.
              </p>

              <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Download className="w-3.5 h-3.5" />Download template
              </button>

              {/* File picker */}
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl px-4 py-8 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
              >
                <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onPick} className="hidden" />
                {fileName ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-slate-700">
                    <FileText className="w-4 h-4 text-blue-500" />{fileName}
                  </div>
                ) : (
                  <div className="text-sm text-slate-400">
                    <Upload className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                    Click to choose a CSV file
                  </div>
                )}
              </div>

              {result && (
                <div className={`flex items-center gap-2 text-sm ${result.ok ? 'text-green-600' : 'text-red-600'}`}>
                  {result.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  {result.message}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={close} className="btn-secondary">Close</button>
                <button onClick={handleImport} disabled={loading || !csvText} className="btn-primary">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
