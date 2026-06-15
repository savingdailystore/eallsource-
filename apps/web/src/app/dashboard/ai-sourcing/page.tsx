'use client';

import { useState, useRef } from 'react';
import {
  Brain, Search, ExternalLink, ShieldCheck, ShieldAlert, ShieldX,
  TrendingUp, Zap, ChevronDown, ChevronUp, Package, Plus,
  Loader2, Sparkles, AlertCircle, CheckCircle, Eye,
} from 'lucide-react';
import type { SourceOpportunity } from '@server/services/ai-sourcer/types';
import { formatCurrency } from '@lib/utils';

// ─── Suggestion chips ────────────────────────────────────────────────────────
const SUGGESTIONS = [
  'electric toothbrush', 'coffee maker', 'board game', 'skin cream',
  'office supplies', 'hand vacuum', 'water flosser', 'batteries',
  'storage containers', 'art supplies',
];

// ─── Types ───────────────────────────────────────────────────────────────────
interface APIResponse {
  results: SourceOpportunity[];
  count: number;
  demoMode: boolean;
  aiMode: boolean;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ScoreRing({ score, recommendation }: { score: number; recommendation: string }) {
  const r = 22;
  const circumference = 2 * Math.PI * r;
  const fill = (score / 100) * circumference;
  const color =
    recommendation === 'BUY' ? '#16a34a' :
    recommendation === 'WATCH' ? '#d97706' : '#dc2626';
  const bg =
    recommendation === 'BUY' ? '#f0fdf4' :
    recommendation === 'WATCH' ? '#fffbeb' : '#fef2f2';

  return (
    <div className="relative flex-shrink-0" style={{ width: 60, height: 60, background: bg, borderRadius: '50%' }}>
      <svg width="60" height="60" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="30" cy="30" r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" />
        <circle
          cx="30" cy="30" r={r} fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={`${fill} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold leading-none" style={{ color }}>{score}</span>
        <span className="text-[9px] font-medium leading-none" style={{ color, opacity: 0.7 }}>/ 100</span>
      </div>
    </div>
  );
}

function RecBadge({ rec }: { rec: string }) {
  const cfg = {
    BUY:   { cls: 'bg-green-100 text-green-700 border-green-200',  icon: CheckCircle,  label: 'BUY' },
    WATCH: { cls: 'bg-amber-100 text-amber-700 border-amber-200',  icon: Eye,          label: 'WATCH' },
    SKIP:  { cls: 'bg-red-100 text-red-700 border-red-200',        icon: AlertCircle,  label: 'SKIP' },
  }[rec] ?? { cls: 'bg-gray-100 text-gray-600 border-gray-200', icon: AlertCircle, label: rec };

  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

function IpChip({ risk }: { risk: string }) {
  if (risk === 'LOW') return <span className="flex items-center gap-0.5 text-xs text-green-600"><ShieldCheck className="w-3 h-3" />Low IP</span>;
  if (risk === 'MEDIUM') return <span className="flex items-center gap-0.5 text-xs text-amber-600"><ShieldAlert className="w-3 h-3" />Med IP</span>;
  return <span className="flex items-center gap-0.5 text-xs text-red-600"><ShieldX className="w-3 h-3" />High IP</span>;
}

function OpportunityCard({ opp, onAdd }: { opp: SourceOpportunity; onAdd: (o: SourceOpportunity) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const { retailerHit: hit, amazon, profit, aiDecision, ipRisk } = opp;

  async function handleAdd() {
    if (added) return;
    setAdding(true);
    try {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asin: hit.asin ?? amazon?.asin,
          name: hit.name,
          category: hit.category,
          sourceUrl: hit.sourceUrl,
          sourceRetailer: hit.retailer,
          sourcePrice: profit.sourcePrice,
          imageUrl: hit.imageUrl,
          upc: hit.upc,
        }),
      });
      setAdded(true);
    } finally {
      setAdding(false);
    }
  }

  const recColor =
    aiDecision.recommendation === 'BUY' ? 'border-l-green-500' :
    aiDecision.recommendation === 'WATCH' ? 'border-l-amber-400' : 'border-l-red-400';

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 border-l-4 ${recColor} overflow-hidden shadow-sm hover:shadow-md transition-shadow`}>
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Product image */}
          <div className="w-14 h-14 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {hit.imageUrl ? (
              <img src={hit.imageUrl} alt={hit.name} className="w-14 h-14 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <Package className="w-6 h-6 text-gray-300" />
            )}
          </div>

          {/* Score ring */}
          <ScoreRing score={aiDecision.score} recommendation={aiDecision.recommendation} />

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight line-clamp-2">{hit.name}</h3>
              <RecBadge rec={aiDecision.recommendation} />
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400 dark:text-gray-500 mb-2">
              <span className="font-medium text-gray-600 dark:text-gray-300">{hit.brand}</span>
              <span>·</span>
              <span>{hit.category}</span>
              {hit.asin && <>
                <span>·</span>
                <a href={`https://www.amazon.com/dp/${hit.asin}`} target="_blank" rel="noopener noreferrer" className="font-mono text-orange-500 hover:underline">{hit.asin}</a>
              </>}
              <span>·</span>
              <IpChip risk={ipRisk} />
              {aiDecision.poweredByAI && (
                <span className="flex items-center gap-0.5 text-purple-500 font-medium">
                  <Sparkles className="w-2.5 h-2.5" />AI
                </span>
              )}
            </div>

            {/* Price strip */}
            <div className="grid grid-cols-4 gap-3 mb-3">
              <PriceStat label="Buy At" value={formatCurrency(profit.sourcePrice)} sub={hit.retailer} />
              <PriceStat label="Amazon BB" value={amazon ? formatCurrency(amazon.buyBoxPrice) : '—'} sub={amazon ? `${amazon.fbaSellers} FBA` : ''} />
              <PriceStat label="Net Profit" value={formatCurrency(profit.netProfit)} highlight={profit.netProfit > 0} />
              <PriceStat label="ROI" value={`${profit.roi.toFixed(1)}%`} highlight={profit.roi >= 30} />
            </div>

            {/* AI note */}
            <p className="text-xs text-gray-500 dark:text-gray-400 italic mb-3">"{aiDecision.note}"</p>

            {/* Action row */}
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={hit.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                View on {hit.retailer}
              </a>
              {hit.asin && (
                <a
                  href={`https://www.amazon.com/dp/${hit.asin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-medium bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-3 py-1.5 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  View on Amazon
                </a>
              )}
              {hit.asin && (
                <a
                  href={`https://keepa.com/#!product/1-${hit.asin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-3 py-1.5 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                >
                  <TrendingUp className="w-3 h-3" />
                  Keepa History
                </a>
              )}
              <button
                onClick={handleAdd}
                disabled={adding || added}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ml-auto ${
                  added
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 cursor-default'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                {added ? 'Added' : 'Add to Products'}
              </button>
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {expanded ? 'Less' : 'Details'}
              </button>
            </div>
          </div>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* AI Reasoning */}
            <div>
              <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                {aiDecision.poweredByAI ? '✦ Claude AI Reasoning' : '⚙ Rules Engine Reasoning'}
              </div>
              {aiDecision.reasons.length > 0 && (
                <div className="space-y-1 mb-2">
                  {aiDecision.reasons.map((r, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-green-700 dark:text-green-400">
                      <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      {r}
                    </div>
                  ))}
                </div>
              )}
              {aiDecision.risks.length > 0 && (
                <div className="space-y-1">
                  {aiDecision.risks.map((r, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      {r}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Amazon Competition */}
            {amazon && (
              <div>
                <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Competition Snapshot</div>
                <div className="grid grid-cols-2 gap-2">
                  <DetailStat label="BSR" value={`#${amazon.bsr.toLocaleString()}`} />
                  <DetailStat label="Category" value={amazon.bsrCategory} />
                  <DetailStat label="FBA Sellers" value={String(amazon.fbaSellers)} />
                  <DetailStat label="Total Sellers" value={String(amazon.totalSellers)} />
                  <DetailStat label="Amazon BB?" value={amazon.amazonOwnsBuyBox ? 'Yes ⚠' : 'No ✓'} />
                  <DetailStat label="Confidence" value={aiDecision.confidence} />
                </div>
              </div>
            )}

            {/* Full profit breakdown */}
            <div className="md:col-span-2">
              <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Profit Breakdown</div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                <DetailStat label="Source Price" value={formatCurrency(profit.sourcePrice)} />
                <DetailStat label="Cashback" value={`-${formatCurrency(profit.cashbackAmount)}`} />
                <DetailStat label="Final Cost" value={formatCurrency(profit.finalCost)} />
                <DetailStat label="Amazon Fees" value={formatCurrency(profit.amazonFees)} />
                <DetailStat label="Prep + Tax" value={formatCurrency(profit.prepFee + profit.taxAmount)} />
                <DetailStat label="Net Profit" value={formatCurrency(profit.netProfit)} bold />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PriceStat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide mb-0.5">{label}</div>
      <div className={`text-sm font-bold ${highlight ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 dark:text-gray-500">{sub}</div>}
    </div>
  );
}

function DetailStat({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500 font-medium mb-0.5">{label}</div>
      <div className={`text-xs text-gray-700 dark:text-gray-300 ${bold ? 'font-bold text-green-600 dark:text-green-400' : ''}`}>{value}</div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AISourcingPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SourceOpportunity[] | null>(null);
  const [meta, setMeta] = useState<{ demoMode: boolean; aiMode: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minRoi, setMinRoi] = useState(25);
  const [maxFba, setMaxFba] = useState(15);
  const inputRef = useRef<HTMLInputElement>(null);

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch('/api/ai-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed, minRoi, maxFbaSellers: maxFba }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Search failed');
      }

      const data: APIResponse = await res.json();
      setResults(data.results);
      setMeta({ demoMode: data.demoMode, aiMode: data.aiMode });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1100px]">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center shadow shadow-purple-200">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Arbitrage AI</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Search any product or category — AI finds live retailer deals and scores each opportunity
          </p>
        </div>
      </div>

      {/* Mode badges */}
      {meta && (
        <div className="flex items-center gap-2 flex-wrap">
          {meta.aiMode ? (
            <span className="flex items-center gap-1.5 text-xs font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full">
              <Sparkles className="w-3 h-3" />Claude AI Active
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-3 py-1 rounded-full">
              ⚙ Rules Engine (add ANTHROPIC_API_KEY for Claude AI)
            </span>
          )}
          {meta.demoMode && (
            <span className="flex items-center gap-1.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full">
              <Zap className="w-3 h-3" />Demo Mode — add WALMART_API_KEY for direct product URLs
            </span>
          )}
        </div>
      )}

      {/* Search */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
        <form
          onSubmit={(e) => { e.preventDefault(); runSearch(query); }}
          className="space-y-4"
        >
          {/* Query input */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. electric toothbrush, coffee maker, board games…"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white px-5 py-3 rounded-xl font-medium text-sm transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
              {loading ? 'Scanning…' : 'AI Source'}
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              Min ROI
              <select
                value={minRoi}
                onChange={(e) => setMinRoi(Number(e.target.value))}
                className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value={15}>15%</option>
                <option value={25}>25%</option>
                <option value={30}>30%</option>
                <option value={40}>40%</option>
                <option value={50}>50%</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              Max FBA sellers
              <select
                value={maxFba}
                onChange={(e) => setMaxFba(Number(e.target.value))}
                className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value={8}>8</option>
                <option value={12}>12</option>
                <option value={15}>15</option>
                <option value={20}>20</option>
              </select>
            </label>
          </div>

          {/* Suggestions */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">Try:</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setQuery(s); inputRef.current?.focus(); }}
                className="text-xs bg-gray-50 dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/30 text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 px-2.5 py-1 rounded-lg border border-gray-100 dark:border-gray-700 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-gray-800" />
                <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
                  <div className="grid grid-cols-4 gap-3 mt-3">
                    {[1,2,3,4].map((j) => <div key={j} className="h-8 bg-gray-100 dark:bg-gray-800 rounded" />)}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div className="text-center py-2">
            <p className="text-sm text-gray-400 dark:text-gray-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Scanning retailers, pulling Amazon data, running AI analysis…
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-700 dark:text-red-400 text-sm">Search failed</p>
            <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {results !== null && !loading && (
        <>
          {results.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-16 text-center">
              <Search className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No opportunities found</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Try a broader search term or loosen the ROI filter</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{results.length}</span> opportunities found
                  {query && <> for "<span className="italic">{query}</span>"</>}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 dark:text-gray-500">Sorted by AI score</span>
                </div>
              </div>

              <div className="space-y-3">
                {results.map((opp) => (
                  <OpportunityCard key={opp.id} opp={opp} onAdd={() => {}} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Empty state */}
      {results === null && !loading && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center mx-auto mb-4">
            <Brain className="w-8 h-8 text-purple-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">AI-Powered OA Sourcing</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-6">
            Enter any product name or category and the AI will scan Walmart for matching items,
            pull live Amazon data, calculate profit margins, and score each deal from 0–100.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto text-left">
            {[
              { icon: Search,    title: 'Retailer Search',  desc: 'Scans Walmart for matching products' },
              { icon: TrendingUp, title: 'Amazon Data',     desc: 'Pulls BSR, Buy Box, FBA competition' },
              { icon: Brain,     title: 'AI Analysis',     desc: 'Claude scores and recommends BUY/WATCH/SKIP' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">{title}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
