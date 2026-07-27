'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload, RefreshCw, Loader2, AlertCircle, CheckCircle2,
  ChevronLeft, ChevronRight, Filter, XCircle, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CandidateStatus } from '@prisma/client';

interface Candidate {
  id:              string;
  retailer:        string;
  retailerUrl:     string;
  title:           string | null;
  brand:           string | null;
  asin:            string | null;
  upc:             string | null;
  sourcePrice:     number | null;
  sourceListPrice: number | null;
  onSale:          boolean | null;
  certStatus:      CandidateStatus;
  sourceType:      string;
  sourceCost:      number | null;
  vaNotes:         string | null;
  certNotes:       string | null;
  estimatedProfit: number | null;
  estimatedRoi:    number | null;
  buyBoxPrice:     number | null;
  lastCheckedAt:   string | null;
  amazonCheckedAt: string | null;
  createdAt:       string;
}

const STATUS_COLORS: Record<CandidateStatus, string> = {
  RAW_CANDIDATE:       'bg-slate-700 text-slate-300',
  MATCHED:             'bg-blue-900/60 text-blue-300',
  NEEDS_REVIEW:        'bg-amber-900/60 text-amber-300',
  CERTIFIED:           'bg-green-900/60 text-green-300',
  REJECTED:            'bg-red-900/60 text-red-400',
  STALE:               'bg-slate-700/80 text-slate-500',
  NO_LONGER_PROFITABLE:'bg-orange-900/60 text-orange-400',
};

const ALL_STATUSES: CandidateStatus[] = [
  'RAW_CANDIDATE', 'MATCHED', 'NEEDS_REVIEW', 'CERTIFIED',
  'REJECTED', 'STALE', 'NO_LONGER_PROFITABLE',
];

const fmt    = (n: number | null | undefined, d = 2) =>
  n == null ? '—' : `$${n.toFixed(d)}`;
const fmtRoi = (n: number | null | undefined) =>
  n == null ? '—' : `${(n * 100).toFixed(0)}%`;
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString() : '—';

export default function CandidatesPage() {
  const [candidates,   setCandidates]   = useState<Candidate[]>([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  const [statusFilter,     setStatusFilter]     = useState<CandidateStatus | ''>('');
  const [retailerFilter,   setRetailerFilter]   = useState('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState('');

  // Import
  const [csvText,      setCsvText]      = useState('');
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);
  const [importError,  setImportError]  = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reject
  const [rejectingId,  setRejectingId]  = useState<string | null>(null);
  const [rejectNotes,  setRejectNotes]  = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);

  // Evaluate
  const [evaluatingId,  setEvaluatingId]  = useState<string | null>(null);
  const [batchEvaluating, setBatchEvaluating] = useState(false);
  const [batchResult,     setBatchResult]     = useState<Record<string, unknown> | null>(null);
  const [batchError,      setBatchError]      = useState<string | null>(null);

  const LIMIT = 50;

  const loadCandidates = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page:  String(p),
        limit: String(LIMIT),
        ...(statusFilter     ? { status:     statusFilter }     : {}),
        ...(retailerFilter   ? { retailer:   retailerFilter }   : {}),
        ...(sourceTypeFilter ? { sourceType: sourceTypeFilter } : {}),
      });
      const res  = await fetch(`/api/admin/candidates?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load candidates');
      setCandidates(data.candidates);
      setTotal(data.total);
      setStatusCounts(data.statusCounts ?? {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, retailerFilter, sourceTypeFilter]);

  useEffect(() => { setPage(1); }, [statusFilter, retailerFilter, sourceTypeFilter]);
  useEffect(() => { loadCandidates(page); }, [page, loadCandidates]);

  async function handleImport() {
    if (!csvText.trim()) return;
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const res  = await fetch('/api/admin/candidates/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ csv: csvText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      setImportResult(data);
      setCsvText('');
      loadCandidates(1);
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCsvText(ev.target?.result as string ?? '');
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleReject(id: string) {
    setRejectLoading(true);
    try {
      const res  = await fetch(`/api/admin/candidates/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'REJECT', certNotes: rejectNotes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Reject failed');
      setRejectingId(null);
      setRejectNotes('');
      loadCandidates(page);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setRejectLoading(false);
    }
  }

  async function handleEvaluate(id: string) {
    setEvaluatingId(id);
    try {
      const res  = await fetch(`/api/admin/candidates/${id}/evaluate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Evaluation failed');
      loadCandidates(page);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setEvaluatingId(null);
    }
  }

  async function handleBatchEvaluate() {
    setBatchEvaluating(true);
    setBatchResult(null);
    setBatchError(null);
    try {
      const res  = await fetch('/api/admin/candidates/evaluate-pending', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Batch evaluation failed');
      setBatchResult(data);
      loadCandidates(1);
    } catch (e) {
      setBatchError((e as Error).message);
    } finally {
      setBatchEvaluating(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Candidate Queue</h1>
          <p className="text-slate-400 text-sm mt-1">
            VA-imported sourcing candidates. Import CSV, evaluate against Amazon, review, and reject as needed.
            Certification is Phase 18.4+.
          </p>
        </div>
        {/* Batch evaluate */}
        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={handleBatchEvaluate}
            disabled={batchEvaluating}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {batchEvaluating
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Zap className="w-3.5 h-3.5" />
            }
            Evaluate Pending (≤3)
          </button>
          {batchResult && (
            <span className="text-xs text-green-400">
              Evaluated {String((batchResult as { evaluated?: number }).evaluated ?? 0)} candidates
            </span>
          )}
          {batchError && (
            <span className="text-xs text-red-400">{batchError}</span>
          )}
        </div>
      </div>

      {/* Status counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-6">
        {ALL_STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
            className={cn(
              'text-center rounded-xl px-3 py-2.5 text-xs font-semibold transition-all border',
              statusFilter === s
                ? 'border-blue-500 bg-blue-500/20 text-blue-200'
                : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500',
            )}
          >
            <div className="text-lg font-bold text-white">{statusCounts[s] ?? 0}</div>
            <div className="mt-0.5 leading-tight">{s.replace(/_/g, ' ')}</div>
          </button>
        ))}
      </div>

      {/* CSV Import */}
      <div className="card p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Upload className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-slate-200">Import VA CSV</span>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Required columns: <code className="text-slate-400">retailer_url, retailer, source_price, title</code>.
          Optional: <code className="text-slate-400">asin, upc, brand, source_list_price, on_sale, va_notes, retailer_item_id</code>.
        </p>
        <div className="flex gap-3 flex-wrap mb-3">
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary text-xs py-1.5 px-3"
          >
            Choose file…
          </button>
          {csvText && (
            <span className="text-xs text-slate-400 self-center">
              {csvText.split('\n').length - 1} lines loaded
            </span>
          )}
        </div>
        <textarea
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
          placeholder="Or paste CSV text here…"
          rows={5}
          className="w-full text-xs font-mono bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-y mb-3"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={handleImport}
            disabled={!csvText.trim() || importing}
            className="btn-primary text-sm py-2 px-5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Import
          </button>
          {csvText && (
            <button onClick={() => setCsvText('')} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
              Clear
            </button>
          )}
        </div>

        {importResult && (
          <div className="mt-3 flex items-start gap-2 text-xs text-green-400 bg-green-900/20 border border-green-800/50 rounded-xl px-3 py-2.5">
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Imported <strong>{String(importResult.imported)}</strong> new,
              updated <strong>{String(importResult.updated)}</strong>,
              skipped rejected <strong>{String(importResult.skippedRejected)}</strong>,
              skipped invalid <strong>{String(importResult.skippedRows)}</strong>.
              {(importResult.rowErrors as string[])?.length > 0 && (
                <span className="block mt-1 text-amber-400">
                  Errors: {(importResult.rowErrors as string[]).join('; ')}
                </span>
              )}
            </span>
          </div>
        )}
        {importError && (
          <div className="mt-3 flex items-start gap-2 text-xs text-red-400 bg-red-900/20 border border-red-800/50 rounded-xl px-3 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            {importError}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <Filter className="w-4 h-4 text-slate-500" />
        <select
          value={retailerFilter}
          onChange={e => setRetailerFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-300 px-3 py-1.5 focus:outline-none focus:border-blue-500"
        >
          <option value="">All retailers</option>
          {['Walmart', 'Target', 'Home Depot', 'Costco', 'BJs', 'Big Lots'].map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select
          value={sourceTypeFilter}
          onChange={e => setSourceTypeFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-300 px-3 py-1.5 focus:outline-none focus:border-blue-500"
        >
          <option value="">All source types</option>
          {['VA_IMPORT', 'APIFY_SCAN', 'MANUAL', 'RESCAN'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {(statusFilter || retailerFilter || sourceTypeFilter) && (
          <button
            onClick={() => { setStatusFilter(''); setRetailerFilter(''); setSourceTypeFilter(''); }}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" /> Clear filters
          </button>
        )}
        <button onClick={() => loadCandidates(page)} className="ml-auto flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="card p-4 mb-4 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading candidates…
        </div>
      ) : candidates.length === 0 ? (
        <div className="card p-8 text-center text-slate-500 text-sm">
          No candidates match the current filters.
          {!statusFilter && !retailerFilter && !sourceTypeFilter && (
            <p className="mt-2 text-xs">Import a VA CSV above to get started.</p>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-700/50">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/50">
                  {['Created', 'Retailer', 'Title', 'Source $', 'Buy Box', 'Est. Profit', 'Est. ROI', 'ASIN / UPC', 'Status', 'Checked', 'Actions'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {candidates.map(c => (
                  <tr key={c.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">{c.retailer}</td>
                    <td className="px-3 py-2.5 max-w-[200px]">
                      <a
                        href={c.retailerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 hover:underline line-clamp-2"
                        title={c.title ?? undefined}
                      >
                        {c.title ?? '—'}
                      </a>
                      {c.certNotes && (
                        <p className={cn(
                          'text-[10px] mt-0.5 truncate',
                          c.certStatus === 'REJECTED' || c.certStatus === 'NO_LONGER_PROFITABLE'
                            ? 'text-red-500/70'
                            : c.certStatus === 'NEEDS_REVIEW'
                              ? 'text-amber-500/70'
                              : 'text-slate-600',
                        )} title={c.certNotes}>
                          {c.certNotes}
                        </p>
                      )}
                      {!c.certNotes && c.vaNotes && (
                        <p className="text-slate-600 text-[10px] mt-0.5 truncate" title={c.vaNotes}>
                          {c.vaNotes}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">
                      {fmt(c.sourcePrice)}
                      {c.sourceListPrice && (
                        <span className="text-slate-500 ml-1 line-through">{fmt(c.sourceListPrice)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{fmt(c.buyBoxPrice)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={cn(c.estimatedProfit != null && c.estimatedProfit >= 0 ? 'text-green-400' : 'text-slate-400')}>
                        {fmt(c.estimatedProfit)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{fmtRoi(c.estimatedRoi)}</td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap font-mono text-[10px]">
                      {c.asin && <div>ASIN: {c.asin}</div>}
                      {c.upc  && <div>UPC: {c.upc}</div>}
                      {!c.asin && !c.upc && '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={cn('px-2 py-0.5 rounded-lg text-[10px] font-semibold', STATUS_COLORS[c.certStatus])}>
                        {c.certStatus.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap text-[10px]">
                      {c.lastCheckedAt ? fmtDate(c.lastCheckedAt) : '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        {/* Evaluate button — available for any non-CERTIFIED, non-REJECTED status */}
                        {c.certStatus !== 'CERTIFIED' && (
                          <button
                            onClick={() => handleEvaluate(c.id)}
                            disabled={evaluatingId === c.id}
                            className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
                            title="Run SP-API + Keepa evaluation"
                          >
                            {evaluatingId === c.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Zap className="w-3 h-3" />
                            }
                            Evaluate
                          </button>
                        )}
                        {/* Reject */}
                        {c.certStatus !== 'REJECTED' && c.certStatus !== 'CERTIFIED' && (
                          rejectingId === c.id ? (
                            <div className="flex flex-col gap-1.5 min-w-[160px]">
                              <input
                                type="text"
                                value={rejectNotes}
                                onChange={e => setRejectNotes(e.target.value)}
                                placeholder="Reason (optional)"
                                className="text-[11px] bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-slate-300 focus:outline-none focus:border-red-500"
                              />
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => handleReject(c.id)}
                                  disabled={rejectLoading}
                                  className="text-[11px] px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg disabled:opacity-50 flex items-center gap-1"
                                >
                                  {rejectLoading && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                                  Confirm
                                </button>
                                <button
                                  onClick={() => { setRejectingId(null); setRejectNotes(''); }}
                                  className="text-[11px] px-2 py-1 text-slate-400 hover:text-white rounded-lg"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setRejectingId(c.id); setRejectNotes(''); }}
                              className="text-[11px] text-red-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              Reject
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-xs text-slate-400">
              <span>{total} total — page {page} of {totalPages}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
