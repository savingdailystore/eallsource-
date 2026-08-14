'use client';

/**
 * Admin Fee Preview Tool — /dashboard/admin/tools/fee-preview
 *
 * Read-only SP-API product fee lookup. Lets the platform admin enter an ASIN,
 * resell price, source cost, tax rate, and category to see Amazon's exact
 * referral fee, FBA fee, and estimated profit before creating any candidate.
 *
 * Safety:
 * - No SourceCandidate, Product, Lead, or LeadEntitlement is created.
 * - No DB writes. No scanner jobs. No repricing. No OAuth interaction.
 * - Never falls back to static fee estimates; SP_API_FEE_UNAVAILABLE is shown
 *   as a clear unavailable state — not a placeholder with guessed numbers.
 */

import { useState, useRef } from 'react';
import { Search, Loader2, AlertTriangle, CheckCircle2, XCircle, Info, ShieldOff } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FeePreviewSuccess {
  ok:              true;
  feeStatus:       'SP_API_SUCCESS';
  asin:            string;
  resellPrice:     number;
  sourceCost:      number;
  sourceTaxRate:   number;
  taxedSourceCost: number;
  category:        string;
  referralFee:     number;
  fbaFee:          number;
  totalAmazonFees: number;
  estimatedProfit: number;
  estimatedRoi:    number | null;
  message:         string;
}

interface FeePreviewUnavailable {
  ok:        false;
  feeStatus: 'SP_API_FEE_UNAVAILABLE';
  asin:      string;
  message:   string;
}

type FeePreviewResult = FeePreviewSuccess | FeePreviewUnavailable;

// ── Category options ──────────────────────────────────────────────────────────

const CATEGORIES = [
  { label: 'Beauty & Personal Care (8%)',   value: 'Beauty'        },
  { label: 'Health & Household (8%)',        value: 'Health'        },
  { label: 'Grocery (8%)',                   value: 'Grocery'       },
  { label: 'Pet Supplies (8%)',              value: 'Pet'           },
  { label: 'Toys & Games (15%)',             value: 'Toys'          },
  { label: 'Arts & Crafts (15%)',            value: 'Arts & Crafts' },
  { label: 'Office Products (15%)',          value: 'Office'        },
  { label: 'Everything Else (15%)',          value: 'Everything Else'},
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

function profitColor(profit: number): string {
  if (profit >= 3) return 'text-emerald-400';
  if (profit >= 1) return 'text-yellow-400';
  return 'text-red-400';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FeePreviewPage() {
  const [asin,          setAsin]          = useState('');
  const [resellPrice,   setResellPrice]   = useState('');
  const [sourceCost,    setSourceCost]    = useState('');
  const [sourceTaxRate, setSourceTaxRate] = useState('0.086');
  const [category,      setCategory]      = useState('Beauty');

  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<FeePreviewResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const asinRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch('/api/admin/tools/fee-preview', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asin:          asin.trim().toUpperCase(),
          resellPrice:   parseFloat(resellPrice),
          sourceCost:    parseFloat(sourceCost),
          sourceTaxRate: parseFloat(sourceTaxRate),
          category,
        }),
      });

      // Non-200 HTTP = auth/validation error (not a fee-unavailable result)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? `Server error (${res.status})`);
        return;
      }

      setResult((await res.json()) as FeePreviewResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setError(null);
    setAsin('');
    setResellPrice('');
    setSourceCost('');
    setSourceTaxRate('0.086');
    setCategory('Beauty');
    setTimeout(() => asinRef.current?.focus(), 50);
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-50">SP-API Fee Preview</h1>
        <p className="text-slate-400 text-sm mt-1">
          Look up Amazon referral + FBA fees for an ASIN before creating a candidate.
          Read-only — no records are created.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="card p-5 mb-5 space-y-4">

        {/* ASIN */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            ASIN
          </label>
          <input
            ref={asinRef}
            type="text"
            value={asin}
            onChange={e => setAsin(e.target.value.toUpperCase())}
            placeholder="B000000000"
            maxLength={10}
            pattern="[A-Z0-9]{10}"
            required
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm font-mono placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Prices row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Amazon Resell Price ($)
            </label>
            <input
              type="number"
              value={resellPrice}
              onChange={e => setResellPrice(e.target.value)}
              placeholder="14.99"
              min="0.01"
              step="0.01"
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Source Cost ($)
            </label>
            <input
              type="number"
              value={sourceCost}
              onChange={e => setSourceCost(e.target.value)}
              placeholder="6.99"
              min="0.01"
              step="0.01"
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Tax rate + category row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Source Tax Rate
            </label>
            <input
              type="number"
              value={sourceTaxRate}
              onChange={e => setSourceTaxRate(e.target.value)}
              placeholder="0.086"
              min="0"
              max="1"
              step="0.001"
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-slate-600 text-xs mt-1">Default: 0.086 (8.6 %)</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Amazon Category <span className="normal-case font-normal text-slate-600">(display only)</span>
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <p className="text-slate-600 text-xs mt-1">Fee rates come from SP-API, not this field.</p>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-md text-sm transition-colors"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Looking up fees…</>
            : <><Search className="w-4 h-4" /> Get SP-API Fee Estimate</>}
        </button>
      </form>

      {/* HTTP/validation error (distinct from SP-API unavailable) */}
      {error && (
        <div className="card p-4 mb-5 flex items-start gap-3 border-red-700/60 bg-red-950/30">
          <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        result.feeStatus === 'SP_API_FEE_UNAVAILABLE'
          ? <UnavailableState asin={result.asin} onReset={handleReset} />
          : <SuccessState result={result} onReset={handleReset} />
      )}
    </div>
  );
}

// ── Unavailable state ─────────────────────────────────────────────────────────

function UnavailableState({ asin, onReset }: { asin: string; onReset: () => void }) {
  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-950/40 border border-amber-700/50">
        <ShieldOff className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-amber-300 font-semibold text-sm">SP-API fee estimate unavailable</p>
          <p className="text-amber-400/80 text-xs mt-1">
            Amazon could not return a fee estimate for <span className="font-mono">{asin}</span> at this
            time. This may mean the ASIN is not active in your seller account's marketplace, the SP-API
            credential is not connected, or the SP-API returned an error for this item.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-slate-500">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <p>
          No candidate, product, or lead was created. No database records were written.
          Verify the ASIN is live and your SP-API credentials are connected, then try again.
        </p>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="w-full text-xs text-slate-500 hover:text-slate-300 transition-colors py-1"
      >
        Try another ASIN
      </button>
    </div>
  );
}

// ── Success state ─────────────────────────────────────────────────────────────

function SuccessState({ result, onReset }: { result: FeePreviewSuccess; onReset: () => void }) {
  return (
    <div className="card p-5 space-y-5">
      {/* SP-API confirmation banner */}
      <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
        <CheckCircle2 className="w-4 h-4" />
        SP-API fees confirmed for <span className="font-mono">{result.asin}</span>
      </div>

      {/* Fee breakdown */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Fee Breakdown</p>
        <div className="space-y-2 text-sm">
          <Row label="Amazon Resell Price"                        value={fmt(result.resellPrice)}       />
          <Row label="Source Cost (pre-tax)"                      value={fmt(result.sourceCost)}        />
          <Row
            label={`Source Tax (${(result.sourceTaxRate * 100).toFixed(1)} %)`}
            value={fmt(result.taxedSourceCost - result.sourceCost)}
          />
          <Row label="Taxed Source Cost"                          value={fmt(result.taxedSourceCost)} bold />
          <div className="border-t border-slate-700/50 my-2" />
          <Row label="Referral Fee"  value={fmt(result.referralFee)}     badge="SP-API" badgeColor="emerald" />
          <Row label="FBA Fee"       value={fmt(result.fbaFee)}          badge="SP-API" badgeColor="emerald" />
          <Row label="Total Amazon Fees" value={fmt(result.totalAmazonFees)} bold />
        </div>
      </div>

      {/* Profit summary */}
      <div className="border-t border-slate-700/50 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-300">Estimated Profit</span>
          <span className={cn('text-2xl font-bold', profitColor(result.estimatedProfit))}>
            {fmt(result.estimatedProfit)}
          </span>
        </div>
        {result.estimatedRoi !== null && (
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-slate-500">ROI (on taxed source cost)</span>
            <span className={cn('text-sm font-semibold', profitColor(result.estimatedProfit))}>
              {result.estimatedRoi.toFixed(1)} %
            </span>
          </div>
        )}
      </div>

      {/* STARTER_SALES gate — only shown when SP-API fees are confirmed */}
      <div className={cn(
        'text-xs px-3 py-2 rounded-md font-medium',
        result.estimatedProfit >= 1
          ? 'bg-emerald-950/40 border border-emerald-700/40 text-emerald-300'
          : 'bg-red-950/40 border border-red-700/40 text-red-300',
      )}>
        {result.estimatedProfit >= 1
          ? `✓ Passes STARTER_SALES $1 profit minimum (${fmt(result.estimatedProfit)} profit)`
          : `✗ Fails STARTER_SALES $1 profit minimum (${fmt(result.estimatedProfit)} profit)`}
      </div>

      {/* Read-only reminder */}
      <div className="flex items-start gap-2 text-xs text-slate-600">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <p>{result.message}</p>
      </div>

      {/* Reset */}
      <button
        type="button"
        onClick={onReset}
        className="w-full text-xs text-slate-500 hover:text-slate-300 transition-colors py-1"
      >
        Clear and check another ASIN
      </button>
    </div>
  );
}

// ── Row sub-component ─────────────────────────────────────────────────────────

function Row({
  label,
  value,
  bold       = false,
  badge,
  badgeColor = 'slate',
}: {
  label:       string;
  value:       string;
  bold?:       boolean;
  badge?:      string;
  badgeColor?: 'emerald' | 'yellow' | 'slate';
}) {
  const badgeCls = {
    emerald: 'bg-emerald-900/50 text-emerald-400 border-emerald-700/40',
    yellow:  'bg-yellow-900/50 text-yellow-400 border-yellow-700/40',
    slate:   'bg-slate-800 text-slate-400 border-slate-700',
  }[badgeColor];

  return (
    <div className="flex items-center justify-between">
      <span className={cn('text-slate-400', bold && 'text-slate-200 font-semibold')}>
        {label}
        {badge && (
          <span className={cn('ml-2 text-[10px] px-1.5 py-0.5 rounded border font-medium', badgeCls)}>
            {badge}
          </span>
        )}
      </span>
      <span className={cn('font-mono text-slate-200', bold && 'font-bold')}>{value}</span>
    </div>
  );
}
