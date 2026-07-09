'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  SlidersHorizontal, X, Loader2, RefreshCw, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { STRATEGY_META, estimateFloorBreakdown } from '@/engines/repricingReadiness';
import type { ReadinessResult } from '@/engines/repricingReadiness';
import { ReadinessBadge } from './ReadinessBadge';
import { formatCurrency } from '@/lib/utils';

interface Rule {
  id:                 string;
  asin:               string;
  title:              string | null;
  minRoi:             number;
  minProfit:          number;
  strategy:           string;
  isActive:           boolean;
  floorPrice:         number | null;
  costBasis:          number | null;
  // Optional warning flags from repricing guards
  skuMismatch?:       boolean;
  costBasisMismatch?: boolean;
  availableQuantity?: number | null;
  inventoryUnitCost?: number | null;
}

export function EditRuleModal({
  rule,
  readiness,
}: {
  rule:       Rule;
  readiness?: ReadinessResult;
}) {
  const router = useRouter();
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [runResult, setRunResult] = useState<{
    proposalQueued:   boolean;
    direction:        string;
    recommendedPrice: number;
  } | null>(null);

  const [form, setForm] = useState({
    strategy:   rule.strategy,
    minRoi:     String(rule.minRoi),
    minProfit:  String(rule.minProfit),
    floorPrice: rule.floorPrice != null ? String(rule.floorPrice) : '',
    costBasis:  rule.costBasis  != null ? String(rule.costBasis)  : '',
    isActive:   rule.isActive,
  });

  function close() { setOpen(false); setError(''); setRunResult(null); setShowAdvanced(false); }

  function buildPatchBody() {
    return {
      strategy:   form.strategy,
      minRoi:     parseFloat(form.minRoi),
      minProfit:  parseFloat(form.minProfit),
      floorPrice: form.floorPrice.trim() === '' ? null : parseFloat(form.floorPrice),
      costBasis:  form.costBasis.trim()  === '' ? null : parseFloat(form.costBasis),
      isActive:   form.isActive,
    };
  }

  async function saveRule(): Promise<boolean> {
    const res = await fetch(`/api/repricing/rules/${rule.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(buildPatchBody()),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to save changes.');
      return false;
    }
    return true;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setRunResult(null);
    const ok = await saveRule();
    setLoading(false);
    if (ok) { close(); router.refresh(); }
  }

  async function handleSaveAndRun(e: React.MouseEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setRunResult(null);

    const saved = await saveRule();
    if (!saved) { setLoading(false); return; }

    const res  = await fetch(`/api/repricing/rules/${rule.id}`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? 'Rule saved, but repricing could not run — check that market data is available.');
      router.refresh();
      return;
    }

    setRunResult({
      proposalQueued:   data.proposalQueued,
      direction:        data.data?.direction ?? 'HOLD',
      recommendedPrice: data.data?.recommendedPrice ?? 0,
    });
    router.refresh();
  }

  // ── Live floor preview ────────────────────────────────────────────────────────
  const costNum    = parseFloat(form.costBasis)   || 0;
  const roiNum     = parseFloat(form.minRoi)      || 0;
  const profitNum  = parseFloat(form.minProfit)   || 0;
  const manualNum  = parseFloat(form.floorPrice)  || 0;

  const floorBreakdown = costNum > 0
    ? estimateFloorBreakdown(costNum, roiNum, profitNum, manualNum > 0 ? manualNum : null)
    : null;

  const activeMeta  = STRATEGY_META[form.strategy] ?? STRATEGY_META['COMPETITIVE'];
  const canRun      = form.isActive;

  // Guard warning flags — derived from rule props, static for the lifetime of the modal
  const hasSkuMismatch       = rule.skuMismatch ?? false;
  const hasCostMismatch      = rule.costBasisMismatch ?? false;
  const hasZeroInventory     = (rule.availableQuantity ?? null) !== null && (rule.availableQuantity ?? 1) <= 0;
  const isReactivating       = !rule.isActive && form.isActive;
  const reactivationRisky    = isReactivating && (hasSkuMismatch || hasCostMismatch || hasZeroInventory || rule.costBasis == null);

  const BINDING_LABEL: Record<string, string> = {
    profit: 'Min Profit',
    roi:    'Min ROI',
    manual: 'Manual Floor',
    none:   'N/A',
  };

  const overlay = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
    >
      <div className="bg-slate-900 rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-slate-50">Customize Rule</h2>
              {readiness && <ReadinessBadge readiness={readiness} />}
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">
              {rule.asin}{rule.title ? ` · ${rule.title}` : ''}
            </p>
          </div>
          <button onClick={close} className="text-slate-500 hover:text-slate-300 transition-colors ml-3 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {runResult ? (
          /* Post-run feedback */
          <div className="px-6 py-5 space-y-4">
            <div className={`flex items-start gap-2.5 rounded-xl p-3 ${runResult.proposalQueued ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-slate-800/60'}`}>
              {runResult.proposalQueued
                ? <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                : <AlertTriangle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />}
              <div className="text-sm">
                {runResult.proposalQueued ? (
                  <>
                    <div className="font-semibold text-blue-300">Price proposal queued</div>
                    <div className="text-slate-400 mt-0.5">
                      Recommended {formatCurrency(runResult.recommendedPrice)} ({runResult.direction}) — review in
                      <span className="font-medium text-slate-200"> Price Proposals</span> below and push when ready.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-semibold text-slate-200">No price change recommended</div>
                    <div className="text-slate-400 mt-0.5">
                      Current pricing is already optimal at {formatCurrency(runResult.recommendedPrice)}.
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={close} className="btn-primary text-sm">Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="px-6 py-5 space-y-5">

            {/* ── Quick Templates ─────────────────────────────────────────── */}
            <div>
              <label className="label mb-1.5">Quick Templates</label>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { name: 'Conservative Buy Box', strategy: 'COMPETITIVE', minRoi: 25, minProfit: 5  },
                  { name: 'Aggressive Buy Box',   strategy: 'COMPETITIVE', minRoi: 15, minProfit: 3  },
                  { name: 'Protect Profit',       strategy: 'FLOOR',       minRoi: 35, minProfit: 8  },
                  { name: 'Clear Inventory',      strategy: 'COMPETITIVE', minRoi: 10, minProfit: 2  },
                  { name: 'Price High',           strategy: 'CEILING',     minRoi: 40, minProfit: 10 },
                ] as const).map((tpl) => (
                  <button
                    key={tpl.name}
                    type="button"
                    onClick={() => setForm((f) => ({
                      ...f,
                      strategy:  tpl.strategy,
                      minRoi:    String(tpl.minRoi),
                      minProfit: String(tpl.minProfit),
                    }))}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:border-blue-500/50 hover:text-blue-300 transition-all"
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-600 mt-1">Prefills the fields below — you can still adjust before saving.</p>
            </div>

            {/* ── Essentials ─────────────────────────────────────────────── */}
            <div className="space-y-4">
              {/* Strategy */}
              <div>
                <label className="label">Pricing Strategy</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {Object.entries(STRATEGY_META).map(([value, meta]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, strategy: value }))}
                      className={`text-left px-3 py-2.5 rounded-xl border text-xs transition-all ${
                        form.strategy === value
                          ? 'bg-blue-500/15 border-blue-500/50 text-blue-200'
                          : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <div className="font-semibold text-[11px] uppercase tracking-wide mb-0.5">
                        {value === 'COMPETITIVE' ? 'Chase' : value === 'FLOOR' ? 'Protect' : 'High'}
                      </div>
                      <div className="font-medium">{meta.label}</div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-1.5">{activeMeta.desc}</p>
              </div>

              {/* Unit Cost */}
              <div>
                <label className="label">
                  Unit Cost ($) <span className="text-slate-500 font-normal">— what you paid per unit</span>
                </label>
                <input
                  value={form.costBasis}
                  onChange={(e) => setForm((f) => ({ ...f, costBasis: e.target.value }))}
                  type="number" step="0.01" min="0" className="input"
                  placeholder="e.g. 14.50"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Required to compute your safe floor. Without it, set a Manual Floor Price below or the rule is skipped.
                </p>
              </div>

              {/* Min Profit */}
              <div>
                <label className="label">Min Profit ($)</label>
                <input
                  value={form.minProfit}
                  onChange={(e) => setForm((f) => ({ ...f, minProfit: e.target.value }))}
                  type="number" step="0.01" min="0" required className="input"
                />
              </div>
            </div>

            {/* ── Estimated safe floor preview ───────────────────────────── */}
            {floorBreakdown && (
              <div className="bg-slate-800/50 rounded-xl p-4 text-xs space-y-1.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    Estimated safe floor
                  </span>
                  <span className="text-[10px] text-slate-600">approximate</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Profit floor</span>
                  <span>{formatCurrency(floorBreakdown.profitFloor)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>ROI floor</span>
                  <span>{formatCurrency(floorBreakdown.roiFloor)}</span>
                </div>
                {floorBreakdown.manualFloor > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Manual floor</span>
                    <span>{formatCurrency(floorBreakdown.manualFloor)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-slate-200 border-t border-slate-700 pt-1.5 mt-1.5">
                  <span>Effective floor</span>
                  <span className="text-slate-50">{formatCurrency(floorBreakdown.effectiveFloor)}</span>
                </div>
                <div className="text-[10px] text-slate-600">
                  Binding constraint: {BINDING_LABEL[floorBreakdown.bindingRule] ?? 'N/A'} · Assumes 15% referral, $4.56 FBA, 8.75% source tax
                </div>
              </div>
            )}

            {/* ── Advanced (collapsible) ──────────────────────────────────── */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Advanced settings
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-4 pt-3 border-t border-slate-800">
                  <div>
                    <label className="label">Min ROI (%)</label>
                    <input
                      value={form.minRoi}
                      onChange={(e) => setForm((f) => ({ ...f, minRoi: e.target.value }))}
                      type="number" step="1" min="0" max="500" required className="input"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Minimum return on your unit cost. Combined with Min Profit — the stricter limit sets your floor.
                    </p>
                  </div>

                  <div>
                    <label className="label">
                      Manual Floor Price ($) <span className="text-slate-500 font-normal">(optional)</span>
                    </label>
                    <input
                      value={form.floorPrice}
                      onChange={(e) => setForm((f) => ({ ...f, floorPrice: e.target.value }))}
                      type="number" step="0.01" min="0" className="input"
                      placeholder="Leave blank to use Min ROI floor"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      A hard price the rule never sells below — effective floor is the higher of this and your Min ROI floor.
                    </p>
                  </div>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                      className="w-4 h-4 rounded border-slate-700 text-blue-500 focus:ring-blue-400"
                    />
                    <span className="text-sm text-slate-200">Rule active</span>
                    <span className="text-xs text-slate-500">— inactive rules are skipped on Run All</span>
                  </label>
                </div>
              )}
            </div>

            {/* ── Guard warnings ─────────────────────────────────────────── */}
            {hasSkuMismatch && (
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300 leading-relaxed">
                  <span className="font-semibold">SKU mismatch:</span> The SKU used in repricing history does not match your current inventory. Verify in Seller Central which merchant SKU is attached to this ASIN before pushing prices.
                </p>
              </div>
            )}

            {hasCostMismatch && (
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300 leading-relaxed">
                  <span className="font-semibold">Cost basis mismatch:</span> Unit cost differs significantly from inventory unit cost
                  {rule.inventoryUnitCost != null ? ` ($${rule.inventoryUnitCost.toFixed(2)} in inventory)` : ''}.
                  Review before repricing — floor and ROI calculations depend on this value.
                </p>
              </div>
            )}

            {hasZeroInventory && (
              <div className="flex items-start gap-2 bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
                <AlertTriangle className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-400 leading-relaxed">
                  <span className="font-semibold">No inventory on hand.</span> Running this rule will create a HOLD — no proposals will be queued until units are restocked.
                </p>
              </div>
            )}

            {reactivationRisky && (
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300 leading-relaxed">
                  <span className="font-semibold">Reactivating this rule may create future price proposals.</span> Review inventory, SKU, and cost basis before saving.
                </p>
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={close} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={loading} className="btn-secondary">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save Rule
              </button>
              {canRun && (
                <button
                  type="button"
                  onClick={handleSaveAndRun}
                  disabled={loading}
                  className="btn-primary"
                  title="Save settings and immediately run this rule's repricing calculation"
                >
                  {loading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <RefreshCw className="w-4 h-4" />}
                  Save & Run Now
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Customize rule"
        className="p-1.5 rounded-lg text-slate-600 hover:text-blue-500 hover:bg-blue-500/10 transition-all"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
      </button>

      {open && createPortal(overlay, document.body)}
    </>
  );
}
