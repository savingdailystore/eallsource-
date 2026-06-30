import { AlertTriangle } from 'lucide-react';
import type { InventoryHealthResult, RestockSignal } from '@/engines/inventoryHealth';
import { InventoryHealthBadge } from './InventoryHealthBadge';

const RESTOCK_CONFIG: Record<RestockSignal, { label: string; color: string }> = {
  REORDER_NOW:    { label: 'Reorder Now',    color: 'text-red-400'    },
  REORDER_SOON:   { label: 'Reorder Soon',   color: 'text-amber-400'  },
  HOLD:           { label: 'Hold',           color: 'text-slate-300'  },
  DO_NOT_REORDER: { label: 'Do Not Reorder', color: 'text-red-500'    },
  UNKNOWN:        { label: 'Unknown',        color: 'text-slate-500'  },
};

export function InventoryIntelPanel({ health }: { health: InventoryHealthResult }) {
  const restock = RESTOCK_CONFIG[health.restockSignal];

  return (
    <div className="px-4 py-3 bg-slate-900/60 border-t border-slate-800 space-y-3">

      {/* Status + recommendation */}
      <div className="flex items-start gap-3 flex-wrap">
        <InventoryHealthBadge status={health.status} />
        <p className="text-xs text-slate-400 flex-1 min-w-0">{health.recommendation}</p>
      </div>

      {/* 4-column detail grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        {/* Key reasons */}
        <div>
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Key Reasons
          </div>
          <ul className="space-y-0.5">
            {health.reasons.map((r, i) => (
              <li key={i} className="text-xs text-slate-300 leading-snug">{r}</li>
            ))}
          </ul>
        </div>

        {/* Restock signal */}
        <div>
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Restock Signal
          </div>
          <span className={`text-xs font-semibold ${restock.color}`}>{restock.label}</span>
          <div className="text-[10px] text-slate-500 mt-1">
            {health.agingSource === 'purchased'
              ? `Purchased ${health.agingDays} day${health.agingDays !== 1 ? 's' : ''} ago`
              : `Tracked ${health.agingDays} day${health.agingDays !== 1 ? 's' : ''}`}
            {' '}· bucket {health.agingBucket}d
          </div>
        </div>

        {/* Profit / ROI */}
        <div>
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Profit / ROI
          </div>
          {health.profitSummary ? (
            <div className="space-y-0.5 text-xs">
              <div>
                <span className="text-slate-400">ROI </span>
                <span className="font-semibold text-slate-100">
                  {health.profitSummary.roi.toFixed(1)}%
                </span>
              </div>
              <div>
                <span className="text-slate-400">Profit </span>
                <span className="font-semibold text-slate-100">
                  ${health.profitSummary.profit.toFixed(2)}
                </span>
              </div>
              <div className="text-slate-500">
                Sell price ${health.profitSummary.price.toFixed(2)}
              </div>
              {health.profitSummary.unitCost != null && (
                <div className="text-slate-500">
                  Unit cost ${health.profitSummary.unitCost.toFixed(2)}
                  {health.profitSummary.unitCostSource === 'repricing' && (
                    <span className="text-slate-600"> (from repricing)</span>
                  )}
                </div>
              )}
              {health.profitSummary.inventoryValue != null && (
                <div className="text-slate-400">
                  In-stock value ${health.profitSummary.inventoryValue.toFixed(2)}
                </div>
              )}
              {health.profitSummary.unitCost == null && (
                <div className="text-slate-600 text-[10px] mt-1">
                  Add unit cost to track inventory value
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-600">No scan data</span>
          )}
        </div>

        {/* Demand summary */}
        <div>
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Demand
          </div>
          {health.demandSummary ? (
            <div className="space-y-0.5 text-xs">
              <div>
                <span className="text-slate-400">Signal </span>
                <span className="font-semibold text-slate-100">
                  {health.demandSummary.level}
                </span>
              </div>
              {health.demandSummary.bsr != null && (
                <div className="text-slate-500">
                  BSR {health.demandSummary.bsr.toLocaleString()}
                </div>
              )}
              {health.demandSummary.monthlySales != null && (
                <div className="text-slate-500">
                  ~{health.demandSummary.monthlySales}/mo (market est.)
                </div>
              )}
              {health.demandSummary.fbaSellers != null && (
                <div className="text-slate-500">
                  {health.demandSummary.fbaSellers} FBA seller
                  {health.demandSummary.fbaSellers !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-600">No scan data</span>
          )}
        </div>
      </div>

      {/* Risk factors — only shown when present */}
      {health.riskFactors.length > 0 && (
        <div className="flex items-start gap-2 pt-2 border-t border-slate-800/70">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            {health.riskFactors.map((r, i) => (
              <div key={i} className="text-xs text-slate-400">{r}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
