'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Radar, Loader2, CheckCircle2, XCircle, Clock, Play, ChevronDown, ChevronUp } from 'lucide-react';
import React from 'react';

interface MatchMethodBreakdown {
  upc?:        number;
  ean?:        number;
  brandModel?: number;
  title?:      number;
  unknown?:    number;
}

interface RiskGateBreakdown {
  brandBlocked?:        number;
  ipComplaintHistory?:  number;
  privateLabel?:        number;
  hazmat?:              number;
  genericBrand?:        number;
  amazonSellsIt?:       number;
  priceUnstable?:       number;
  gating?:              number;
  validationFailed?:    number;
}

interface ScraperMetrics {
  retailer?:           string;
  query?:              string;
  productsFound?:      number;
  productsWithUpc?:    number;
  productsWithoutUpc?: number;
  hitProductCap?:      boolean;
}

interface TimingMetrics {
  totalRuntimeMs?:    number;
  scraperRuntimeMs?:  number;
  pipelineRuntimeMs?: number;
}

interface ScanResult {
  found?:   number;
  created?: number;
  updated?: number;
  skipped?: number;
  errors?:  number;
  // Skip-reason breakdown (each sums into `skipped`)
  noMatch?:          number;
  noPricing?:        number;
  notProfitable?:    number;
  demandTooLow?:     number;
  velocityTooLow?:   number;
  noBuyBox?:         number;
  priceDeclining?:   number;
  priceTooLow?:      number;
  validationFailed?: number;
  upcCount?:         number;
  diagnostics?: Array<{
    sourceTitle:      string;
    outcome:          string;
    asin?:            string;
    amazonTitle?:     string;
    matchMethod?:     string;
    matchConfidence?: number;
    upc?:             string;
  }>;
  // Phase 17.1 additions — optional so old ScanJob records don't break
  matchMethodBreakdown?:  MatchMethodBreakdown;
  avgMatchConfidence?:    number;
  lowConfidenceMatches?:  number;
  highConfidenceMatches?: number;
  riskGateBreakdown?:     RiskGateBreakdown;
  scraperMetrics?:        ScraperMetrics;
  timingMetrics?:         TimingMetrics;
}

// Human labels for each named skip reason shown in the primary grid.
const SKIP_LABELS: Array<{ key: keyof ScanResult; label: string }> = [
  { key: 'noMatch',          label: 'No Amazon match' },
  { key: 'noPricing',        label: 'No Amazon pricing data' },
  { key: 'notProfitable',    label: 'Not profitable' },
  { key: 'priceTooLow',      label: 'Resale price too low' },
  { key: 'demandTooLow',     label: 'Weak BSR / demand' },
  { key: 'velocityTooLow',   label: 'Low sales velocity' },
  { key: 'noBuyBox',         label: 'No buy box' },
  { key: 'priceDeclining',   label: 'Price declining' },
  { key: 'validationFailed', label: 'Failed validation' },
];

// Detailed risk gate labels (Phase 17.1). Shown when riskGateBreakdown is present.
const RISK_GATE_LABELS: Array<{ key: keyof RiskGateBreakdown; label: string }> = [
  { key: 'brandBlocked',       label: 'Brand blocked' },
  { key: 'ipComplaintHistory', label: 'IP complaint history' },
  { key: 'privateLabel',       label: 'Amazon private label' },
  { key: 'hazmat',             label: 'Hazmat / dangerous goods' },
  { key: 'genericBrand',       label: 'Generic / unbranded' },
  { key: 'amazonSellsIt',      label: 'Amazon sells it' },
  { key: 'priceUnstable',      label: 'Price volatile' },
  { key: 'gating',             label: 'Other risk gates' },
];

interface Job {
  id:          string;
  type:        string;
  retailer:    string | null;
  query:       string | null;
  status:      string;
  error:       string | null;
  createdAt:   Date | string;
  result:      ScanResult | null;
}

const STATUS_STYLE: Record<string, { cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  PENDING: { cls: 'bg-amber-500/15 text-amber-400',  icon: Clock },
  RUNNING: { cls: 'bg-blue-500/15 text-blue-400',    icon: Loader2 },
  DONE:    { cls: 'bg-green-500/15 text-green-400',   icon: CheckCircle2 },
  FAILED:  { cls: 'bg-red-500/15 text-red-400',       icon: XCircle },
};

function fmt(n: number | undefined): string {
  return n != null ? String(n) : '0';
}

export function ScannerPanel({ retailers, jobs }: { retailers: string[]; jobs: Job[] }) {
  const router = useRouter();
  const [retailer, setRetailer] = useState(retailers[0] ?? '');
  const [query, setQuery]       = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<{ ok: boolean; message: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const hasActive = jobs.some((j) => j.status === 'PENDING' || j.status === 'RUNNING');

  // Auto-refresh while jobs are in progress so statuses update live.
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [hasActive, router]);

  async function startScan(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const res  = await fetch('/api/scanner', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ retailer, query: query.trim() || undefined, category: category.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (res.ok) {
      const r = data.result;
      setResult({
        ok: true,
        message: r
          ? `Scan complete — ${r.created ?? 0} new lead${(r.created ?? 0) === 1 ? '' : 's'} from ${r.found ?? 0} products. Check Lead Feed.`
          : `Scan complete for ${retailer}.`,
      });
      setQuery('');
      setCategory('');
      router.refresh();
    } else {
      setResult({ ok: false, message: data.error ?? data.message ?? 'Scan failed.' });
    }
  }

  return (
    <div className="space-y-6">
      {/* Start scan form */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Radar className="w-4 h-4 text-blue-500" />
          <h2 className="font-semibold text-slate-50">Start a scan</h2>
        </div>

        <form onSubmit={startScan} className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="label">Retailer</label>
              <select value={retailer} onChange={(e) => setRetailer(e.target.value)} className="input">
                {retailers.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Search query</label>
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="input" placeholder="e.g. coffee maker" />
            </div>
            <div>
              <label className="label">Category <span className="text-slate-500 font-normal">(optional)</span></label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} className="input" placeholder="e.g. Home & Kitchen" />
            </div>
          </div>

          {result && (
            <p className={`text-sm flex items-center gap-1.5 ${result.ok ? 'text-green-400' : 'text-red-400'}`}>
              {result.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {result.message}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={loading || !retailer} className="btn-primary">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Scanning…</> : <><Play className="w-4 h-4" />Start scan</>}
            </button>
          </div>
        </form>

        {loading && (
          <p className="text-xs text-slate-500 mt-3">Scraping and analysing against Amazon — this can take a minute or two. Keep this tab open.</p>
        )}
        <p className="text-xs text-slate-500 mt-4 leading-relaxed">
          Scans run live via Apify and are matched + priced against Amazon. Qualified opportunities appear in your{' '}
          <span className="font-medium text-slate-400">Lead Feed</span>. For recurring searches, use{' '}
          <span className="font-medium text-slate-400">Scheduled searches</span> below.
        </p>
      </div>

      {/* Recent jobs */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold text-slate-50">Recent scans</h2>
          {hasActive && <span className="text-xs text-blue-600 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Live</span>}
        </div>

        {jobs.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">No scans yet. Start one above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40">
                  {['Retailer', 'Query', 'Status', 'Products', 'Leads', 'Started', ''].map((h, i) => (
                    <th key={h || i} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {jobs.map((job) => {
                  const s        = STATUS_STYLE[job.status] ?? STATUS_STYLE.PENDING;
                  const found    = job.result?.found;
                  const leads    = (job.result?.created ?? 0) + (job.result?.updated ?? 0);
                  const hasStats = job.status === 'DONE' && job.result != null;
                  const r        = job.result;
                  const skipped  = r?.skipped ?? 0;
                  const namedSkips = SKIP_LABELS.reduce((sum, { key }) => sum + (Number(r?.[key]) || 0), 0);
                  // For old records without riskGateBreakdown, show the aggregate "other" count
                  const hasRiskBreakdown = !!r?.riskGateBreakdown;
                  const riskGateTotal    = hasRiskBreakdown
                    ? RISK_GATE_LABELS.reduce((sum, { key }) => sum + (Number(r!.riskGateBreakdown![key]) || 0), 0)
                    : Math.max(0, skipped - namedSkips);
                  const hasDiag    = Array.isArray(r?.diagnostics) && r!.diagnostics!.length > 0;
                  const hasNewMetrics = !!(r?.matchMethodBreakdown || r?.riskGateBreakdown || r?.scraperMetrics);
                  const canExpand  = hasStats && (skipped > 0 || hasDiag || hasNewMetrics);
                  const isExp      = expanded === job.id;
                  return (
                    <React.Fragment key={job.id}>
                      <tr
                        className={`hover:bg-slate-800/40 ${canExpand ? 'cursor-pointer' : ''}`}
                        onClick={canExpand ? () => setExpanded(isExp ? null : job.id) : undefined}
                      >
                        <td className="table-td font-medium text-slate-100">{job.retailer ?? '—'}</td>
                        <td className="table-td text-slate-300">{job.query || <span className="text-slate-500">all</span>}</td>
                        <td className="table-td">
                          <span className={`badge text-xs ${s.cls}`}>
                            <s.icon className={`w-3 h-3 mr-1 ${job.status === 'RUNNING' ? 'animate-spin' : ''}`} />
                            {job.status}
                          </span>
                          {job.status === 'FAILED' && job.error && (
                            <div className="text-[10px] text-red-400 mt-1 max-w-xs truncate" title={job.error}>{job.error}</div>
                          )}
                        </td>
                        <td className="table-td text-slate-300 text-xs">{hasStats && found != null ? found : '—'}</td>
                        <td className="table-td text-xs">
                          {hasStats
                            ? <span className={leads > 0 ? 'font-semibold text-green-400' : 'text-slate-500'}>{leads}</span>
                            : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="table-td text-slate-400 text-xs">{new Date(job.createdAt).toLocaleString()}</td>
                        <td className="table-td text-xs text-slate-500">
                          {canExpand && (isExp
                            ? <ChevronUp className="w-3.5 h-3.5" />
                            : <span className="flex items-center gap-1">{skipped > 0 ? `${skipped} filtered` : 'details'}<ChevronDown className="w-3.5 h-3.5" /></span>)}
                        </td>
                      </tr>

                      {isExp && r && (
                        <tr className="bg-slate-800/40">
                          <td colSpan={7} className="px-5 py-3 space-y-4">

                            {/* ── Skip reasons ─────────────────────────────── */}
                            {skipped > 0 && (
                              <div>
                                <div className="text-[10px] text-slate-500 uppercase font-semibold mb-2">
                                  Why {skipped} product{skipped === 1 ? '' : 's'} didn't become leads
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5">
                                  {SKIP_LABELS.filter(({ key }) => (Number(r[key]) || 0) > 0).map(({ key, label }) => (
                                    <div key={key} className="flex items-center justify-between text-xs">
                                      <span className="text-slate-400">{label}</span>
                                      <span className="font-mono text-slate-200">{Number(r[key]) || 0}</span>
                                    </div>
                                  ))}

                                  {/* Risk gate breakdown — detailed when available, aggregate for old records */}
                                  {hasRiskBreakdown ? (
                                    RISK_GATE_LABELS.filter(({ key }) => (Number(r.riskGateBreakdown![key]) || 0) > 0).map(({ key, label }) => (
                                      <div key={key} className="flex items-center justify-between text-xs">
                                        <span className="text-slate-400">{label}</span>
                                        <span className="font-mono text-slate-200">{Number(r.riskGateBreakdown![key]) || 0}</span>
                                      </div>
                                    ))
                                  ) : (
                                    riskGateTotal > 0 && (
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-slate-400">Other risk gates</span>
                                        <span className="font-mono text-slate-200">{riskGateTotal}</span>
                                      </div>
                                    )
                                  )}
                                </div>
                                {!hasRiskBreakdown && riskGateTotal > 0 && (
                                  <p className="text-[10px] text-slate-500 mt-2">
                                    "Other risk gates" = Amazon-on-listing, suppressed-by-volatility, hazmat, private/generic brand, IP history, etc.
                                  </p>
                                )}
                              </div>
                            )}

                            {/* ── Match quality metrics (Phase 17.1) ───────── */}
                            {r.matchMethodBreakdown && (
                              <div className="pt-3 border-t border-slate-800">
                                <div className="text-[10px] text-slate-500 uppercase font-semibold mb-2 flex items-center gap-3 flex-wrap">
                                  <span>Match quality</span>
                                  {r.avgMatchConfidence != null && r.avgMatchConfidence > 0 && (
                                    <span className={`badge text-[10px] ${r.avgMatchConfidence >= 90 ? 'bg-green-500/15 text-green-400' : r.avgMatchConfidence >= 70 ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                      avg {r.avgMatchConfidence}% confidence
                                    </span>
                                  )}
                                  {r.scraperMetrics?.productsWithUpc != null && r.scraperMetrics.productsFound != null && (
                                    <span className={`badge text-[10px] ${r.scraperMetrics.productsWithUpc > 0 ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                      {r.scraperMetrics.productsWithUpc}/{r.scraperMetrics.productsFound} had UPC
                                    </span>
                                  )}
                                  {/* Fallback UPC badge for old records */}
                                  {!r.scraperMetrics && r.upcCount != null && r.found != null && (
                                    <span className={`badge text-[10px] ${r.upcCount > 0 ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                      {r.upcCount}/{r.found} had a UPC
                                    </span>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5">
                                  {(r.matchMethodBreakdown.upc ?? 0) > 0 && (
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-blue-400">UPC matched</span>
                                      <span className="font-mono text-slate-200">{fmt(r.matchMethodBreakdown.upc)}</span>
                                    </div>
                                  )}
                                  {(r.matchMethodBreakdown.ean ?? 0) > 0 && (
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-blue-400">EAN matched</span>
                                      <span className="font-mono text-slate-200">{fmt(r.matchMethodBreakdown.ean)}</span>
                                    </div>
                                  )}
                                  {(r.matchMethodBreakdown.brandModel ?? 0) > 0 && (
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-slate-400">Brand + model</span>
                                      <span className="font-mono text-slate-200">{fmt(r.matchMethodBreakdown.brandModel)}</span>
                                    </div>
                                  )}
                                  {(r.matchMethodBreakdown.title ?? 0) > 0 && (
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-amber-400">Title match</span>
                                      <span className="font-mono text-slate-200">{fmt(r.matchMethodBreakdown.title)}</span>
                                    </div>
                                  )}
                                  {(r.matchMethodBreakdown.unknown ?? 0) > 0 && (
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-slate-500">Manual / unknown</span>
                                      <span className="font-mono text-slate-200">{fmt(r.matchMethodBreakdown.unknown)}</span>
                                    </div>
                                  )}
                                  {(r.lowConfidenceMatches ?? 0) > 0 && (
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-amber-400">Low confidence (&lt;70%)</span>
                                      <span className="font-mono text-slate-200">{fmt(r.lowConfidenceMatches)}</span>
                                    </div>
                                  )}
                                  {(r.highConfidenceMatches ?? 0) > 0 && (
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-green-400">High confidence (≥90%)</span>
                                      <span className="font-mono text-slate-200">{fmt(r.highConfidenceMatches)}</span>
                                    </div>
                                  )}
                                </div>
                                {(r.matchMethodBreakdown.title ?? 0) > 0 && (
                                  <p className="text-[10px] text-slate-500 mt-2">
                                    Blue = exact barcode match, amber = fuzzy title. High title-match counts with low confidence (&lt;70%) may indicate mismatches — verify in diagnostics below.
                                  </p>
                                )}
                              </div>
                            )}

                            {/* ── Scraper metrics (Phase 17.1) ─────────────── */}
                            {r.scraperMetrics && (r.scraperMetrics.hitProductCap || r.timingMetrics) && (
                              <div className="pt-3 border-t border-slate-800">
                                <div className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Scraper</div>
                                <div className="flex flex-wrap gap-3 text-[10px]">
                                  {r.scraperMetrics.hitProductCap && (
                                    <span className="badge bg-amber-500/15 text-amber-400">Hit product cap — more results may exist</span>
                                  )}
                                  {r.timingMetrics?.totalRuntimeMs != null && (
                                    <span className="text-slate-500">
                                      {(r.timingMetrics.totalRuntimeMs / 1000).toFixed(1)}s total
                                      {r.timingMetrics.scraperRuntimeMs != null && ` · ${(r.timingMetrics.scraperRuntimeMs / 1000).toFixed(1)}s scraper`}
                                      {r.timingMetrics.pipelineRuntimeMs != null && ` · ${(r.timingMetrics.pipelineRuntimeMs / 1000).toFixed(1)}s pipeline`}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* ── Match diagnostics (existing, unchanged) ───── */}
                            {Array.isArray(r.diagnostics) && r.diagnostics.length > 0 && (
                              <div className="pt-3 border-t border-slate-800">
                                <div className="text-[10px] text-slate-500 uppercase font-semibold mb-2 flex items-center gap-2 flex-wrap">
                                  <span>Match diagnostics — compare source vs. matched Amazon listing</span>
                                  {/* Show UPC badge from old records that lack scraperMetrics */}
                                  {!r.scraperMetrics && !r.matchMethodBreakdown && r.upcCount != null && r.found != null && (
                                    <span className={`badge text-[10px] ${r.upcCount > 0 ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                      {r.upcCount}/{r.found} had a UPC
                                    </span>
                                  )}
                                </div>
                                <div className="space-y-1.5">
                                  {r.diagnostics.map((d, i) => {
                                    const isBarcode = d.matchMethod === 'UPC' || d.matchMethod === 'EAN';
                                    return (
                                      <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs border-l-2 border-slate-700 pl-2.5 py-0.5">
                                        <div className="min-w-0">
                                          <span className="text-slate-500">src </span>
                                          <span className="text-slate-300">{d.sourceTitle}</span>
                                        </div>
                                        <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                                          <span className={`badge text-[10px] ${d.outcome === 'lead' ? 'bg-green-500/15 text-green-400' : 'bg-slate-700 text-slate-400'}`}>{d.outcome}</span>
                                          {d.matchMethod && (
                                            <span className={`text-[10px] ${isBarcode ? 'text-blue-400' : 'text-amber-400'}`}>
                                              {d.matchMethod}{d.matchConfidence != null ? ` ${d.matchConfidence}%` : ''}
                                            </span>
                                          )}
                                          {d.upc && <span className="text-[10px] font-mono text-slate-500">UPC {d.upc}</span>}
                                        </div>
                                        <div className="min-w-0 sm:col-start-2">
                                          {d.asin ? (
                                            <>
                                              <a href={`https://www.amazon.com/dp/${d.asin}`} target="_blank" rel="noreferrer" className="font-mono text-blue-400 hover:underline">{d.asin}</a>
                                              <span className="text-slate-400"> {d.amazonTitle ?? ''}</span>
                                            </>
                                          ) : (
                                            <span className="text-slate-600 italic">no ASIN matched{d.upc ? ' (had a UPC — barcode didn\'t resolve)' : ''}</span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                <p className="text-[10px] text-slate-500 mt-2">
                                  Blue method = exact barcode match, amber = fuzzy title. If a source title and its matched Amazon title clearly differ, that match is wrong.
                                </p>
                              </div>
                            )}

                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
