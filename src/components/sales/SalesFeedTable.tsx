'use client';

import { useState }        from 'react';
import Link                from 'next/link';
import { formatCurrency }  from '@/lib/utils';
import {
  getSaleProfitStatus,
  applySalesFilter,
  type ProfitStatus,
  type SalesFilter,
} from '@/engines/salesTracking';
import { Info, Receipt, FileText } from 'lucide-react';

// ─── Serialized row type (Date → string for RSC→client boundary) ──────────────

export interface SerializedSaleRow {
  id:                    string;
  asin:                  string | null;
  sku:                   string | null;
  productName:           string | null;
  saleDate:              string; // ISO string
  quantitySold:          number;
  grossRevenue:          number;
  netRevenue:            number;
  totalFees:             number | null;
  cogs:                  number | null;
  grossProfitBeforeFees: number | null;
  realizedProfit:        number | null;
  roi:                   number | null;
  unitCostUsed:          number | null;
  costSource:            string | null;
  fulfillmentChannel:    string | null;
  orderStatus:           string | null;
  promotionDiscount:     number | null;
}

// ─── Filter tab definitions ───────────────────────────────────────────────────

const FILTER_TABS: { filter: SalesFilter; label: string }[] = [
  { filter: 'all',            label: 'All' },
  { filter: 'complete',       label: 'Complete' },
  { filter: 'gross-only',     label: 'Gross only' },
  { filter: 'missing-fees',   label: 'Missing fees' },
  { filter: 'missing-cost',   label: 'Missing cost' },
  { filter: 'no-profit-data', label: 'No profit data' },
  { filter: 'incomplete',     label: 'Incomplete' },
];

const EMPTY_MESSAGES: Record<SalesFilter, string> = {
  'all':            'No sales records found.',
  'complete':       'No sales with complete profit data yet.',
  'gross-only':     'No sales are in gross-only state.',
  'missing-fees':   'No sales are missing settlement fees.',
  'missing-cost':   'No sales are missing unit cost.',
  'no-profit-data': 'No sales are missing both cost and fee data.',
  'incomplete':     'No incomplete profit rows.',
};

// ─── Badge configs ────────────────────────────────────────────────────────────

const PROFIT_STATUS_CONFIG: Record<ProfitStatus, { label: string; color: string; tooltip?: string }> = {
  COMPLETE:       { label: 'Complete',       color: 'text-emerald-400 bg-emerald-500/10' },
  GROSS_ONLY:     { label: 'Gross only',     color: 'text-amber-400 bg-amber-500/10'     },
  MISSING_COST:   { label: 'Missing cost',   color: 'text-slate-300 bg-slate-700'        },
  NO_PROFIT_DATA: { label: 'No profit data', color: 'text-slate-500 bg-slate-800'        },
  INCOMPLETE:     {
    label:   'Incomplete',
    color:   'text-amber-500 bg-amber-500/10',
    tooltip: 'Cost and fees exist, but realized profit could not be calculated.',
  },
};

const COST_SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  PO_ITEM:   { label: 'Purchase Order', color: 'text-emerald-400 bg-emerald-500/10' },
  INVENTORY: { label: 'Inventory',      color: 'text-blue-400 bg-blue-500/10'       },
  REPRICING: { label: 'Repricing rule', color: 'text-violet-400 bg-violet-500/10'   },
  PRODUCT:   { label: 'Product data',   color: 'text-slate-300 bg-slate-700'        },
};

// ─── Missing-fees guidance prop ───────────────────────────────────────────────

export interface MissingFeesGuidance {
  count:                    number;
  earliestDate:             string | null; // ISO
  latestDate:               string | null; // ISO
  skuCount:                 number;
  lastSettlementImportDate: string | null; // ISO
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  return formatCurrency(v);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toFixed(1)}%`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProfitStatusBadge({ status }: { status: ProfitStatus }) {
  const cfg = PROFIT_STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.color}`}
      title={cfg.tooltip}
    >
      {cfg.label}
    </span>
  );
}

function CostSourceBadge({ source }: { source: string }) {
  const cfg = COST_SOURCE_LABELS[source] ?? { label: source, color: 'text-slate-400 bg-slate-800' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SalesFeedTable({
  rows,
  initialFilter,
  missingFeesGuidance,
}: {
  rows:                 SerializedSaleRow[];
  initialFilter:        SalesFilter;
  missingFeesGuidance?: MissingFeesGuidance | null;
}) {
  const [activeFilter, setActiveFilter] = useState<SalesFilter>(initialFilter);

  // Filter counts — match the filter semantics exactly
  const counts: Record<SalesFilter, number> = {
    'all':            rows.length,
    'complete':       rows.filter(r => getSaleProfitStatus(r) === 'COMPLETE').length,
    'gross-only':     rows.filter(r => getSaleProfitStatus(r) === 'GROSS_ONLY').length,
    'missing-fees':   rows.filter(r => r.totalFees === null).length,
    'missing-cost':   rows.filter(r => r.unitCostUsed === null).length,
    'no-profit-data': rows.filter(r => getSaleProfitStatus(r) === 'NO_PROFIT_DATA').length,
    'incomplete':     rows.filter(r => getSaleProfitStatus(r) === 'INCOMPLETE').length,
  };

  const filteredRows = applySalesFilter(rows, activeFilter);

  // Show All always; show other tabs when they have rows OR are currently active
  const visibleTabs = FILTER_TABS.filter(
    ({ filter }) => filter === 'all' || filter === activeFilter || counts[filter] > 0,
  );

  const hasGrossOnly = filteredRows.some(r => getSaleProfitStatus(r) === 'GROSS_ONLY');

  return (
    <div className="card overflow-hidden">
      {/* Filter tabs */}
      <div className="px-4 py-2.5 border-b border-slate-800 flex items-center gap-1 flex-wrap">
        {visibleTabs.map(({ filter, label }) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeFilter === filter
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
          >
            {label}{' '}
            <span className={activeFilter === filter ? 'text-blue-200' : 'text-slate-500'}>
              ({counts[filter]})
            </span>
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500 shrink-0">
          Most recent {rows.length} records
        </span>
      </div>

      {/* Missing-fees guidance panel — shown when missing-fees tab is active and there are affected rows */}
      {activeFilter === 'missing-fees' && missingFeesGuidance && missingFeesGuidance.count > 0 && (
        <div className="border-b border-slate-800 bg-amber-500/5 px-4 py-4 space-y-3">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200">
              <strong>
                {missingFeesGuidance.count.toLocaleString()} sale{missingFeesGuidance.count !== 1 ? 's are' : ' is'} missing settlement fees
              </strong>
              {missingFeesGuidance.earliestDate && missingFeesGuidance.latestDate && (
                <> for sales from <strong>{fmtShort(missingFeesGuidance.earliestDate)}</strong> to{' '}
                <strong>{fmtShort(missingFeesGuidance.latestDate)}</strong></>
              )}
              {missingFeesGuidance.skuCount > 0 && (
                <> across {missingFeesGuidance.skuCount} SKU{missingFeesGuidance.skuCount !== 1 ? 's' : ''}</>
              )}
              .
            </p>
          </div>
          <div className="ml-6 space-y-2">
            <p className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <FileText className="w-3 h-3" />
              To import the settlement report:
            </p>
            <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
              <li>Open Amazon Seller Central.</li>
              <li>Go to <span className="text-slate-300">Reports → Payments</span>.</li>
              <li>Download or request the settlement transaction report covering the date range shown above.</li>
              <li>Import it using <span className="text-slate-300">Import Settlement Report</span> on this page.</li>
            </ol>
            <p className="text-xs text-slate-500">
              Settlement fees are matched by order item ID. If the orders report for a sale was not imported
              first, the settlement fee group may not match.
            </p>
          </div>
        </div>
      )}

      {/* Table or empty state */}
      {filteredRows.length === 0 ? (
        <div className="py-14 text-center text-sm text-slate-500">
          {EMPTY_MESSAGES[activeFilter]}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Product</th>
                <th className="text-right px-4 py-2.5 font-medium">Qty</th>
                <th className="text-right px-4 py-2.5 font-medium">Revenue</th>
                <th className="text-right px-4 py-2.5 font-medium">COGS</th>
                <th className="text-right px-4 py-2.5 font-medium">Profit</th>
                <th className="text-right px-4 py-2.5 font-medium">Fees</th>
                <th className="text-right px-4 py-2.5 font-medium">ROI</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-left px-4 py-2.5 font-medium">Cost source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredRows.map((r) => {
                const profitStatus = getSaleProfitStatus(r);

                // Profit cell:
                // COMPLETE   → realized profit (emerald/red)
                // GROSS_ONLY → gross before fees (amber + asterisk)
                // all others → nothing shown
                const profitValue =
                  profitStatus === 'COMPLETE'   ? r.realizedProfit :
                  profitStatus === 'GROSS_ONLY' ? r.grossProfitBeforeFees :
                  null;
                const profitIsReal = profitStatus === 'COMPLETE';
                const profitColor =
                  profitValue == null
                    ? 'text-slate-600'
                    : profitIsReal
                    ? (profitValue >= 0 ? 'text-emerald-400' : 'text-red-400')
                    : 'text-amber-400';

                // ROI: realized only for COMPLETE; estimated gross only for GROSS_ONLY
                const grossRoiEst =
                  profitStatus === 'GROSS_ONLY' &&
                  r.grossProfitBeforeFees != null && r.cogs != null && r.cogs > 0
                    ? (r.grossProfitBeforeFees / r.cogs) * 100
                    : null;

                const saleDate = new Date(r.saleDate);

                return (
                  <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                      {saleDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-4 py-2.5 max-w-[200px]">
                      <div className="text-slate-300 truncate">{r.productName ?? '—'}</div>
                      <div className="text-slate-500 truncate">{r.sku ?? r.asin ?? ''}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-300">{r.quantitySold}</td>
                    <td className="px-4 py-2.5 text-right text-slate-200">{fmt(r.netRevenue)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-400">
                      {r.cogs != null
                        ? fmt(r.cogs)
                        : <span className="text-slate-600">—</span>}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-medium ${profitColor}`}>
                      {profitValue != null ? (
                        <span title={profitIsReal ? 'Realized after Amazon fees' : 'Gross before Amazon fees'}>
                          {fmt(profitValue)}
                          {!profitIsReal && (
                            <span className="text-slate-500 font-normal ml-0.5 text-[9px]">*</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {r.totalFees != null ? (
                        <span className="text-slate-300">{fmt(r.totalFees)}</span>
                      ) : (
                        <span className="flex items-center justify-end gap-1 text-slate-600">
                          <Receipt className="w-3 h-3" />
                          <span>No fees</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {r.roi != null ? (
                        <span className={r.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {fmtPct(r.roi)}
                        </span>
                      ) : grossRoiEst != null ? (
                        <span className="text-amber-400" title="Estimated before Amazon fees">
                          {fmtPct(grossRoiEst)}
                          <span className="text-slate-500 font-normal ml-0.5 text-[9px]">est.</span>
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <ProfitStatusBadge status={profitStatus} />
                    </td>
                    <td className="px-4 py-2.5">
                      {r.costSource ? (
                        <CostSourceBadge source={r.costSource} />
                      ) : r.unitCostUsed === null ? (
                        <Link
                          href={
                            r.sku
                              ? `/dashboard/inventory?sku=${encodeURIComponent(r.sku)}`
                              : '/dashboard/inventory'
                          }
                          className="text-blue-400 hover:underline text-[10px] font-medium whitespace-nowrap"
                        >
                          Add cost →
                        </Link>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Gross-only footnote — only when amber estimates are visible */}
      {hasGrossOnly && (
        <div className="px-4 py-3 border-t border-slate-800 text-xs text-slate-500 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
          <span>
            * Profit and ROI marked with an asterisk are gross estimates before Amazon fees.
            Import a settlement report to calculate realized profit and true ROI.
          </span>
        </div>
      )}
    </div>
  );
}
