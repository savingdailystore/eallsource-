'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUp, ArrowDown, Loader2, UploadCloud, X, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronUp, AlertCircle, Clock,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import {
  STRATEGY_META, RISK_FACTOR_LABELS, RISK_LEVEL_LABELS, RISK_LEVEL_COLORS,
  riskScoreToLevel, type RiskFactor,
} from '@/engines/repricingReadiness';
import { PushAllModal } from './PushAllModal';

export interface Proposal {
  id:               string;
  asin:             string;
  title:            string | null;
  previousPrice:    number | null;
  recommendedPrice: number;
  direction:        string;
  riskScore:        number;
  sku:              string | null;
  buyBoxPrice:      number | null;
  reason:           string | null;
  strategy:         string;
  estimatedFloor:   number | null;
  costBasis:        number | null;
  estimatedProfit:  number | null;
  estimatedRoi:     number | null;
  dataAgeHours:     number;
  isSafeToSend:     boolean;
  riskFactors:      RiskFactor[];
}

function riskColor(score: number): string {
  if (score >= 75) return 'text-red-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-slate-400';
}

interface ExpandedRowProps {
  p: Proposal;
}

function WhyRow({ p }: ExpandedRowProps) {
  const stratMeta  = STRATEGY_META[p.strategy];
  const riskLevel  = riskScoreToLevel(p.riskScore);
  const riskLabel  = RISK_LEVEL_LABELS[riskLevel];
  const riskCls    = RISK_LEVEL_COLORS[riskLevel];

  const dollarChange = p.previousPrice != null
    ? p.recommendedPrice - p.previousPrice
    : null;
  const pctChange = p.previousPrice != null && p.previousPrice > 0
    ? ((p.recommendedPrice - p.previousPrice) / p.previousPrice) * 100
    : null;

  const hasProfit  = p.estimatedProfit != null && p.estimatedRoi != null;

  // Convert dataAgeHours to a human-readable label
  const dataAgeLabel = p.dataAgeHours < 1
    ? 'Less than 1 hour ago'
    : p.dataAgeHours < 24
    ? `${Math.floor(p.dataAgeHours)}h ago`
    : `${Math.floor(p.dataAgeHours / 24)}d ago`;
  const dataStale = p.dataAgeHours >= 48;

  return (
    <tr>
      <td colSpan={8} className="px-4 pb-3 pt-0">
        <div className="bg-slate-800/60 rounded-xl p-4 text-xs space-y-3">

          {/* ── Price simulation ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-slate-500 mb-0.5">Current price</div>
              <div className="font-medium text-slate-200">
                {p.previousPrice != null ? formatCurrency(p.previousPrice) : '—'}
              </div>
            </div>
            <div>
              <div className="text-slate-500 mb-0.5">Recommended</div>
              <div className="font-medium text-slate-50">{formatCurrency(p.recommendedPrice)}</div>
              {dollarChange != null && (
                <div className={`text-[10px] mt-0.5 ${dollarChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {dollarChange >= 0 ? '+' : ''}{formatCurrency(dollarChange)}
                  {pctChange != null && ` (${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%)`}
                </div>
              )}
            </div>
            <div>
              <div className="text-slate-500 mb-0.5">Est. profit <span className="text-slate-600">(est.)</span></div>
              {hasProfit ? (
                <>
                  <div className="font-medium text-slate-50">{formatCurrency(p.estimatedProfit!)}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">ROI {p.estimatedRoi!.toFixed(1)}%</div>
                </>
              ) : (
                <div className="text-slate-600 italic">Not enough data to estimate.</div>
              )}
            </div>
            <div>
              <div className="text-slate-500 mb-0.5">Safe floor</div>
              <div className="font-medium text-slate-200">
                {p.estimatedFloor != null ? formatCurrency(p.estimatedFloor) : '—'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-0.5">
            <div>
              <div className="text-slate-500 mb-0.5">Buy Box</div>
              <div className="font-medium text-slate-200">
                {p.buyBoxPrice != null ? formatCurrency(p.buyBoxPrice) : '—'}
              </div>
            </div>
            <div>
              <div className="text-slate-500 mb-0.5">Strategy</div>
              <div className="font-medium text-slate-200">{stratMeta?.label ?? p.strategy}</div>
            </div>
            <div>
              <div className="text-slate-500 mb-0.5">Safe to push</div>
              <div className={`font-medium ${p.isSafeToSend ? 'text-green-400' : 'text-amber-400'}`}>
                {p.isSafeToSend ? 'Yes' : 'No — missing SKU or stale data'}
              </div>
            </div>
            <div>
              <div className="text-slate-500 mb-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Market data age
              </div>
              <div className={`font-medium ${dataStale ? 'text-amber-400' : 'text-slate-300'}`}>
                {dataAgeLabel}
              </div>
              {dataStale && (
                <div className="text-[10px] text-amber-500 mt-0.5">Re-run for fresher data</div>
              )}
            </div>
          </div>

          {/* ── Engine reason ─────────────────────────────────────────── */}
          <div className="border-t border-slate-700 pt-2.5">
            <div className="flex items-start gap-2">
              <span className="text-slate-500 w-20 flex-shrink-0">Engine</span>
              <span className="text-slate-300">{p.reason ?? 'No explanation available for this proposal.'}</span>
            </div>
          </div>

          {/* ── Risk level + factors ──────────────────────────────────── */}
          <div>
            <div className="flex items-start gap-2">
              <span className="text-slate-500 w-20 flex-shrink-0">Risk</span>
              <span className={riskCls}>{p.riskScore.toFixed(0)}/100 — {riskLabel}</span>
            </div>
            {p.riskFactors.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5 ml-20">
                {p.riskFactors.map((f) => (
                  <span key={f} className="px-2 py-0.5 rounded-md bg-slate-700/60 text-slate-400 text-[10px]">
                    {RISK_FACTOR_LABELS[f]}
                  </span>
                ))}
              </div>
            )}
          </div>

        </div>
      </td>
    </tr>
  );
}

// Inline confirmation row shown when user clicks Push on a single proposal.
function PushConfirmRow({ p, onConfirm, onCancel }: { p: Proposal; onConfirm: () => void; onCancel: () => void }) {
  const dollarChange = p.previousPrice != null ? p.recommendedPrice - p.previousPrice : null;
  const pctChange = p.previousPrice != null && p.previousPrice > 0
    ? ((p.recommendedPrice - p.previousPrice) / p.previousPrice) * 100
    : null;
  return (
    <tr>
      <td colSpan={8} className="px-4 pb-3 pt-0">
        <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-4 space-y-3">

          {/* Warning header */}
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-slate-100">Confirm live Amazon price update</span>
          </div>

          {/* Summary grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-slate-500 mb-0.5">ASIN</div>
              <div className="font-mono text-slate-300">{p.asin}</div>
              {p.sku && <div className="font-mono text-slate-500 mt-0.5">{p.sku}</div>}
            </div>
            <div>
              <div className="text-slate-500 mb-0.5">Current price</div>
              <div className="text-slate-300">{p.previousPrice != null ? formatCurrency(p.previousPrice) : '—'}</div>
            </div>
            <div>
              <div className="text-slate-500 mb-0.5">New price</div>
              <div className="font-semibold text-slate-50">{formatCurrency(p.recommendedPrice)}</div>
              {dollarChange != null && (
                <div className={`text-[10px] mt-0.5 ${dollarChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {dollarChange >= 0 ? '+' : ''}{formatCurrency(dollarChange)}
                  {pctChange != null && ` (${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%)`}
                </div>
              )}
            </div>
            <div>
              <div className="text-slate-500 mb-0.5">Safe floor</div>
              <div className="text-slate-300">{p.estimatedFloor != null ? formatCurrency(p.estimatedFloor) : '—'}</div>
              {p.estimatedProfit != null && (
                <div className="text-[10px] text-slate-500 mt-0.5">Est. profit {formatCurrency(p.estimatedProfit)}</div>
              )}
            </div>
          </div>

          {/* Risk score */}
          <div className="text-xs text-slate-500">
            Risk score: <span className={riskColor(p.riskScore)}>{p.riskScore.toFixed(0)}/100</span>
            {p.reason && <span className="text-slate-600"> · {p.reason}</span>}
          </div>

          {/* Live-Amazon warning */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400 leading-relaxed">
              This will update the live Amazon listing price. Review the floor, margin, and risk
              score before confirming. Customers will see the new price within minutes.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={onCancel} className="btn-secondary text-xs py-1.5 px-3">
              Cancel
            </button>
            <button onClick={onConfirm} className="btn-primary text-xs py-1.5 px-3">
              <UploadCloud className="w-3.5 h-3.5" />
              Yes, push price to Amazon
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function ProposalsPanel({ proposals }: { proposals: Proposal[] }) {
  const router = useRouter();
  const [busy, setBusy]               = useState<Set<string>>(new Set());
  const [allBusy, setAllBusy]         = useState(false);
  const [msg, setMsg]                 = useState<{ ok: boolean; text: string } | null>(null);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [showPushAllModal, setShowPushAllModal] = useState(false);

  const pushable = proposals.filter((p) => p.sku);

  // confirmed=true is only passed for push actions; reject never needs it.
  async function act(historyIds: string[], action: 'push' | 'reject', confirmed = false) {
    if (historyIds.length === 0) return;
    setMsg(null);
    if (historyIds.length > 1) setAllBusy(true);
    else setBusy((s) => new Set(s).add(historyIds[0]));

    try {
      const res  = await fetch('/api/repricing/push', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          historyIds,
          action,
          ...(action === 'push' ? { confirmed } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? 'Request failed.' });
      } else if (action === 'reject') {
        setMsg({ ok: true, text: `Dismissed ${data.rejected} proposal${data.rejected === 1 ? '' : 's'}.` });
      } else {
        const failed = data.failed ?? 0;
        setMsg({
          ok:   failed === 0,
          text: failed === 0
            ? `Pushed ${data.pushed} price${data.pushed === 1 ? '' : 's'} to Amazon.`
            : `Pushed ${data.pushed}, ${failed} failed — ${data.results?.find((r: { ok: boolean }) => !r.ok)?.error ?? 'see details'}.`,
        });
      }
      router.refresh();
    } catch {
      setMsg({ ok: false, text: 'Request failed.' });
    } finally {
      setAllBusy(false);
      setBusy(new Set());
    }
  }

  if (proposals.length === 0) return null;

  return (
    <>
      {showPushAllModal && (
        <PushAllModal
          proposals={pushable}
          onConfirm={() => {
            setShowPushAllModal(false);
            act(pushable.map((p) => p.id), 'push', true);
          }}
          onCancel={() => setShowPushAllModal(false)}
        />
      )}

      <div className="card overflow-hidden border-blue-500/30">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-50">Price Proposals</h2>
            <span className="badge bg-blue-500/15 text-blue-300 text-xs">{proposals.length}</span>
          </div>
          <button
            onClick={() => setShowPushAllModal(true)}
            disabled={allBusy || pushable.length === 0}
            className="btn-primary text-xs py-1.5"
            title={pushable.length === 0 ? 'No proposals have a synced SKU to push' : 'Review and push all proposals with a known SKU'}
          >
            {allBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
            Push all ({pushable.length})
          </button>
        </div>

        {msg && (
          <div className={`px-5 py-2 text-xs flex items-center gap-1.5 ${msg.ok ? 'text-green-400 bg-green-500/5' : 'text-red-400 bg-red-500/5'}`}>
            {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            {msg.text}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/40">
                {[
                  ['Product', ''],
                  ['Buy Box', 'Current Amazon Buy Box price'],
                  ['Current', 'Your current listed price'],
                  ['', ''],
                  ['New Price', 'EALLsource recommended price'],
                  ['Risk', 'Risk score 0–100: higher means a larger or riskier price change'],
                  ['Why?', ''],
                  ['', ''],
                ].map(([h, tip], i) => (
                  <th key={h || i} className="table-th" title={tip || undefined}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {proposals.map((p) => {
                const up      = p.direction === 'UP';
                const Arrow   = up ? ArrowUp : ArrowDown;
                const rowBusy = busy.has(p.id) || allBusy;
                const isOpen    = expandedId  === p.id;
                const isConfirm = confirmingId === p.id;
                const stale   = p.dataAgeHours >= 48;
                return (
                  <React.Fragment key={p.id}>
                    <tr className="hover:bg-slate-800/40">
                      <td className="table-td">
                        <div className="flex items-center gap-1.5">
                          <div className="font-medium text-slate-50 max-w-xs truncate">{p.title ?? p.asin}</div>
                          {stale && (
                            <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              Stale — re-run
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {p.asin}{p.sku ? ` · ${p.sku}` : ' · no SKU'}
                        </div>
                      </td>
                      <td className="table-td text-slate-300">{p.buyBoxPrice != null ? formatCurrency(p.buyBoxPrice) : '—'}</td>
                      <td className="table-td text-slate-400">{p.previousPrice != null ? formatCurrency(p.previousPrice) : '—'}</td>
                      <td className="table-td">
                        <Arrow className={`w-4 h-4 ${up ? 'text-green-400' : 'text-red-400'}`} />
                      </td>
                      <td className="table-td font-semibold text-slate-50">{formatCurrency(p.recommendedPrice)}</td>
                      <td className="table-td">
                        <span className={`text-xs ${riskColor(p.riskScore)}`}>{p.riskScore.toFixed(0)}</span>
                      </td>
                      <td className="table-td">
                        <button
                          onClick={() => {
                            setConfirmingId(null);
                            setExpandedId(isOpen ? null : p.id);
                          }}
                          className="flex items-center gap-0.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                          title="See why this price was recommended"
                        >
                          Why?
                          {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </td>
                      <td className="table-td">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              if (!p.sku || rowBusy) return;
                              setExpandedId(null);
                              // Toggle: clicking Push again cancels the confirmation
                              setConfirmingId(isConfirm ? null : p.id);
                            }}
                            disabled={rowBusy || !p.sku}
                            className={`btn-primary text-xs py-1 px-2.5 ${isConfirm ? 'ring-2 ring-amber-400/40' : ''}`}
                            title={!p.sku ? 'No synced SKU — sync your Amazon inventory first' : 'Review and push this price to your live Amazon listing'}
                          >
                            {busy.has(p.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <UploadCloud className="w-3 h-3" />}
                            Push
                          </button>
                          <button
                            onClick={() => {
                              setConfirmingId(null);
                              act([p.id], 'reject');
                            }}
                            disabled={rowBusy}
                            className="text-slate-500 hover:text-red-400 transition-colors p-1"
                            title="Dismiss this proposal"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Confirmation panel — shown when Push is clicked */}
                    {isConfirm && (
                      <PushConfirmRow
                        p={p}
                        onConfirm={() => {
                          setConfirmingId(null);
                          act([p.id], 'push', true);
                        }}
                        onCancel={() => setConfirmingId(null)}
                      />
                    )}

                    {/* Why? expanded row — only when not confirming */}
                    {isOpen && !isConfirm && <WhyRow p={p} />}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
