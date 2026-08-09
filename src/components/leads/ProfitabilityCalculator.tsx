'use client';

import { useState, useId } from 'react';
import { Plus, X, RotateCcw, ExternalLink } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { discountUrl } from '@/lib/discount-urls';
import type { Discount } from '@/types';

interface Props {
  sourcePrice:       number;
  sourceRetailer:    string | null;
  originalDiscounts: Discount[];
  originalFinalCost: number;
  originalProfit:    number;
  amazonFees:        number | null;
  prepFee:           number | null;
  taxAmount:         number | null;
  sourceTaxRate?:    number | null;
  resellPrice:       number;
}

type EditableDiscount = Discount & { _id: string; _custom?: boolean };

function uid() {
  return Math.random().toString(36).slice(2);
}

export function ProfitabilityCalculator({
  sourcePrice,
  sourceRetailer,
  originalDiscounts,
  originalFinalCost,
  originalProfit,
  amazonFees,
  prepFee,
  taxAmount,
  sourceTaxRate,
  resellPrice,
}: Props) {
  const [discounts, setDiscounts] = useState<EditableDiscount[]>(() =>
    originalDiscounts.map((d) => ({ ...d, _id: uid() }))
  );

  const totalDiscount  = discounts.reduce((s, d) => s + (parseFloat(String(d.amount)) || 0), 0);
  const finalCost      = Math.max(0, sourcePrice - totalDiscount);
  const costDelta      = originalFinalCost - finalCost;
  const profit         = originalProfit + costDelta;
  const roi            = finalCost > 0 ? (profit / finalCost) * 100 : 0;

  const profitChanged  = Math.abs(profit - originalProfit) > 0.005;
  const isReset        = Math.abs(totalDiscount - originalDiscounts.reduce((s, d) => s + d.amount, 0)) < 0.001
                         && discounts.length === originalDiscounts.length;

  function updateAmount(id: string, raw: string) {
    const val = parseFloat(raw);
    setDiscounts((prev) =>
      prev.map((d) => d._id === id ? { ...d, amount: isNaN(val) ? 0 : val } : d)
    );
  }

  function updateField(id: string, field: 'source' | 'type', value: string) {
    setDiscounts((prev) =>
      prev.map((d) => d._id === id ? { ...d, [field]: value } : d)
    );
  }

  function removeDiscount(id: string) {
    setDiscounts((prev) => prev.filter((d) => d._id !== id));
  }

  function addDiscount() {
    setDiscounts((prev) => [
      ...prev,
      { _id: uid(), _custom: true, source: '', type: 'coupon', amount: 0 },
    ]);
  }

  function reset() {
    setDiscounts(originalDiscounts.map((d) => ({ ...d, _id: uid() })));
  }

  return (
    <div className="space-y-1">
      {/* Source price */}
      {sourcePrice > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Source Price ({sourceRetailer})</span>
          <span className="font-medium text-slate-100">{formatCurrency(sourcePrice)}</span>
        </div>
      )}

      {/* Discount rows */}
      {discounts.map((d) => {
        const url         = discountUrl(d.source, sourceRetailer ?? '', d.url);
        const isCashback  = d.type === 'cashback' || d.type === 'rewards';

        return (
          <div key={d._id} className="flex items-center gap-1.5 text-sm group">
            <span className="text-green-500 flex-shrink-0">−</span>

            {d._custom ? (
              <input
                value={d.source}
                onChange={(e) => updateField(d._id, 'source', e.target.value)}
                placeholder="Source name"
                aria-label="Discount code"
                className="text-xs bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 w-32 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
              />
            ) : (
              <span className="text-green-400 flex items-center gap-1 min-w-0">
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="underline underline-offset-2 decoration-green-400 hover:text-green-400 flex items-center gap-0.5">
                    {d.source}<ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                ) : d.source}
              </span>
            )}

            {d._custom ? (
              <select
                value={d.type}
                onChange={(e) => updateField(d._id, 'type', e.target.value)}
                aria-label="Discount type"
                className="text-[11px] bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
              >
                <option value="coupon">coupon</option>
                <option value="cashback">cashback</option>
                <option value="promo">promo</option>
                <option value="rewards">rewards</option>
              </select>
            ) : (
              <span className="text-[11px] text-green-400">{d.type}</span>
            )}

            {d.code && (
              <span className="font-mono text-xs bg-green-500/10 border border-green-500/30 px-1 rounded">{d.code}</span>
            )}

            {isCashback && !d._custom && d.amount > 0 && (
              <span className="text-xs text-slate-500" title="Rate at scan time">
                ~{d.percentage ?? ''}%
              </span>
            )}

            <span className="ml-auto flex items-center gap-1 flex-shrink-0">
              <span className="text-[11px] text-slate-500 mr-0.5">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={d.amount === 0 && d._custom ? '' : d.amount}
                onChange={(e) => updateAmount(d._id, e.target.value)}
                aria-label="Discount amount"
                className="w-24 text-right text-sm font-medium text-green-400 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
              />
              <button
                onClick={() => removeDiscount(d._id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-red-400 ml-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          </div>
        );
      })}

      {/* Cashback rate note */}
      {discounts.some((d) => d.type === 'cashback' || d.type === 'rewards') && (
        <p className="text-[10px] text-amber-400">
          ~ Cashback rates at scan time — verify before purchasing.
        </p>
      )}

      {/* Add / Reset controls */}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={addDiscount}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-400 font-medium">
          <Plus className="w-3.5 h-3.5" />Add discount
        </button>
        {!isReset && (
          <button onClick={reset}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 ml-auto">
            <RotateCcw className="w-3 h-3" />Reset
          </button>
        )}
      </div>

      {/* Final Cost */}
      <div className="flex justify-between text-sm font-semibold border-t border-slate-800 pt-2 mt-1">
        <span>Final Cost</span>
        <span className={profitChanged ? (costDelta > 0 ? 'text-green-400' : 'text-red-400') : ''}>
          {formatCurrency(finalCost)}
          {profitChanged && (
            <span className="text-[10px] font-normal ml-1">
              ({costDelta > 0 ? '−' : '+'}{formatCurrency(Math.abs(costDelta))})
            </span>
          )}
        </span>
      </div>

      {/* Separator */}
      <div className="pt-2 mt-1 border-t border-dashed border-slate-800">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Deductions from Resell Price ({formatCurrency(resellPrice)})
        </div>
        {amazonFees === null ? (
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Amazon Fees (referral + FBA)</span>
            <span className="text-slate-500">—</span>
          </div>
        ) : amazonFees > 0 ? (
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Amazon Fees (referral + FBA)</span>
            <span className="text-red-400">−{formatCurrency(amazonFees)}</span>
          </div>
        ) : null}
        {prepFee != null && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Prep Fee</span>
            <span className="text-red-400">−{formatCurrency(prepFee)}</span>
          </div>
        )}
        {taxAmount != null && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">
              Source Tax{sourceTaxRate != null ? ` (${(sourceTaxRate * 100).toFixed(2)}%)` : ''}
            </span>
            <span className="text-red-400">−{formatCurrency(taxAmount)}</span>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="border-t border-slate-800 pt-2 mt-1 space-y-1">
        <div className="flex justify-between text-sm font-bold">
          <span>Net Profit</span>
          <span className={profit >= 0 ? 'text-green-400' : 'text-red-400'}>
            {formatCurrency(profit)}
            {profitChanged && (
              <span className="text-[10px] font-normal ml-1">
                ({profit > originalProfit ? '+' : ''}{formatCurrency(profit - originalProfit)})
              </span>
            )}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">ROI</span>
          <span className={`font-semibold ${roi >= 30 ? 'text-green-400' : 'text-red-400'}`}>
            {formatPercent(roi)}
            {profitChanged && (
              <span className="text-[10px] font-normal ml-1 text-slate-500">
                ({roi > (finalCost > 0 ? (originalProfit / originalFinalCost) * 100 : 0) ? '+' : ''}
                {(roi - (originalFinalCost > 0 ? (originalProfit / originalFinalCost) * 100 : 0)).toFixed(1)}%)
              </span>
            )}
          </span>
        </div>
        <div className="text-xs text-slate-500">
          ROI = (Net Profit ÷ Final Cost) × 100
        </div>
      </div>
    </div>
  );
}
