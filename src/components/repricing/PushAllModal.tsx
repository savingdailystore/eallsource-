'use client';

import { createPortal } from 'react-dom';
import { UploadCloud, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface ProposalSummary {
  direction:        string;
  sku:              string | null;
  riskScore:        number;
  title:            string | null;
  asin:             string;
  recommendedPrice: number;
}

interface Props {
  proposals: ProposalSummary[];
  onConfirm: () => void;
  onCancel:  () => void;
}

export function PushAllModal({ proposals, onConfirm, onCancel }: Props) {
  const upCount       = proposals.filter((p) => p.direction === 'UP'   && p.sku).length;
  const downCount     = proposals.filter((p) => p.direction === 'DOWN' && p.sku).length;
  const excludedCount = proposals.filter((p) => !p.sku).length;
  const highestRisk   = [...proposals].filter((p) => p.sku).sort((a, b) => b.riskScore - a.riskScore)[0];
  const total         = upCount + downCount;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
    >
      <div className="bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-700">
        <div className="px-6 pt-5 pb-4 border-b border-slate-800">
          <h2 className="font-semibold text-slate-50">
            Push {total} price{total !== 1 ? 's' : ''} to Amazon?
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            This changes what customers see and pay. Review carefully.
          </p>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Change summary */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-green-500/10 rounded-xl p-3">
              <div className="text-xl font-bold text-green-400">{upCount}</div>
              <div className="text-xs text-slate-400 mt-0.5">Going Up</div>
            </div>
            <div className="bg-red-500/10 rounded-xl p-3">
              <div className="text-xl font-bold text-red-400">{downCount}</div>
              <div className="text-xs text-slate-400 mt-0.5">Going Down</div>
            </div>
            <div className="bg-slate-800 rounded-xl p-3">
              <div className="text-xl font-bold text-slate-500">{excludedCount}</div>
              <div className="text-xs text-slate-500 mt-0.5">No SKU (skipped)</div>
            </div>
          </div>

          {/* Highest-risk proposal */}
          {highestRisk && highestRisk.riskScore >= 50 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <div className="text-[11px] font-semibold text-amber-400 mb-1 uppercase tracking-wide">
                Highest risk — review before pushing
              </div>
              <div className="text-sm text-slate-200 truncate">
                {highestRisk.title ?? highestRisk.asin}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {formatCurrency(highestRisk.recommendedPrice)} · Risk score {highestRisk.riskScore.toFixed(0)}/100
              </div>
            </div>
          )}

          {/* Live-Amazon warning */}
          <div className="bg-slate-800/60 rounded-xl p-3 flex items-start gap-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400 leading-relaxed">
              Prices are pushed live to your Amazon listings. Customers will see the updated
              price within minutes. A pushed price can only be changed by pushing a new one.
            </p>
          </div>
        </div>

        <div className="px-6 pb-5 flex justify-end gap-3">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn-primary" disabled={total === 0}>
            <UploadCloud className="w-3.5 h-3.5" />
            Yes, push {total} price{total !== 1 ? 's' : ''} to Amazon
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
