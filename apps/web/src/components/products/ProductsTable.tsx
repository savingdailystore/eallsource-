'use client';

import React, { useState } from 'react';
import {
  ExternalLink, Bookmark, BookmarkCheck, Package,
  ChevronDown, ChevronUp, ShieldCheck, ShieldAlert, ShieldX,
  TrendingUp, Check, X, Minus,
} from 'lucide-react';
import { formatCurrency, formatPercent } from '@lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Discount {
  source: string;
  type: 'cashback' | 'coupon' | 'promo' | 'rewards';
  amount: number;
  percentage?: number;
  code?: string;
}

export interface ProductRow {
  id: string;
  asin: string;
  title: string;
  upc?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  sourceUrl?: string | null;
  sourceRetailer?: string | null;
  sourcePrice?: number | null;
  availableDiscounts?: Discount[] | null;
  discountSources?: string[] | null;
  finalCost?: number | null;
  amazonUrl?: string | null;
  buyBoxPrice?: number | null;
  lowestListedPrice?: number | null;
  estimatedResellPrice?: number | null;
  price: number;
  amazonFees?: number | null;
  prepFee?: number | null;
  taxAmount?: number | null;
  fees: number;
  profit: number;
  roi: number;
  bsr?: number | null;
  bsrPercentage?: number | null;
  autoUngated?: boolean | null;
  buyBoxOwner?: string | null;
  amazonIsSeller?: boolean | null;
  amazonOwnsBuyBox?: boolean | null;
  ipRiskScore?: string | null;
  keepaLink?: string | null;
  score: number;
  createdAt: string;
}

interface ProductsTableProps {
  products: ProductRow[];
  savedIds?: Set<string>;
  onSave?: (productId: string) => void;
  onUnsave?: (productId: string) => void;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RoiBadge({ roi }: { roi: number }) {
  const cls =
    roi >= 60 ? 'bg-green-100 text-green-700' :
    roi >= 40 ? 'bg-blue-100 text-blue-700' :
    roi >= 0  ? 'bg-yellow-100 text-yellow-700' :
    'bg-red-100 text-red-700';
  return (
    <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>
      {roi.toFixed(1)}%
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 80 ? 'bg-green-100 text-green-700' :
    score >= 60 ? 'bg-blue-100 text-blue-700' :
    score >= 40 ? 'bg-amber-100 text-amber-700' :
    'bg-gray-100 text-gray-500';
  const tier = score >= 80 ? '🔥 HOT' : score >= 60 ? '✅ GOOD' : score >= 40 ? '⚠️ MAR' : '⛔ SKIP';
  return (
    <div className={`inline-flex flex-col items-center px-2 py-0.5 rounded-lg text-xs font-bold ${cls}`}>
      <span>{score}</span>
      <span className="text-[9px] opacity-70">{tier}</span>
    </div>
  );
}

function IpBadge({ score }: { score?: string | null }) {
  if (score === 'HIGH')   return <span className="flex items-center gap-1 text-xs text-red-700 font-medium"><ShieldX className="w-3.5 h-3.5" />High</span>;
  if (score === 'MEDIUM') return <span className="flex items-center gap-1 text-xs text-yellow-700 font-medium"><ShieldAlert className="w-3.5 h-3.5" />Med</span>;
  return <span className="flex items-center gap-1 text-xs text-green-700 font-medium"><ShieldCheck className="w-3.5 h-3.5" />Low</span>;
}

function BoolCell({ val, invert }: { val?: boolean | null; invert?: boolean }) {
  const show = invert ? !val : val;
  if (show === null || show === undefined) return <Minus className="w-3.5 h-3.5 text-gray-300" />;
  return show
    ? <Check className="w-3.5 h-3.5 text-green-600" />
    : <X className="w-3.5 h-3.5 text-gray-300" />;
}

function BuyBoxBadge({ owner }: { owner?: string | null }) {
  const map: Record<string, string> = {
    AMAZON:     'bg-orange-100 text-orange-700',
    FBA_SELLER: 'bg-green-100 text-green-700',
    FBM_SELLER: 'bg-blue-100 text-blue-700',
    NONE:       'bg-gray-100 text-gray-500',
  };
  const labels: Record<string, string> = {
    AMAZON: 'Amazon', FBA_SELLER: 'FBA', FBM_SELLER: 'FBM', NONE: 'None',
  };
  const key = owner ?? 'NONE';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[key] ?? map.NONE}`}>
      {labels[key] ?? owner ?? '—'}
    </span>
  );
}

function ProductImage({ asin, imageUrl, title }: { asin: string; imageUrl?: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  const src = imageUrl || `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SL75_.jpg`;
  if (failed) {
    return (
      <div className="w-10 h-10 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center flex-shrink-0">
        <Package className="w-4 h-4 text-gray-300" />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
      <img src={src} alt={title} className="w-10 h-10 object-contain" onError={() => setFailed(true)} />
    </div>
  );
}

// ─── Profitability Formula Panel ─────────────────────────────────────────────

function ProfitabilityFormula({ p }: { p: ProductRow }) {
  const discounts = (p.availableDiscounts as Discount[] | null) ?? [];
  const totalDiscount = discounts.reduce((sum, d) => sum + d.amount, 0);
  const finalCost     = p.finalCost ?? (p.sourcePrice ?? 0) - totalDiscount;
  const resell        = p.lowestListedPrice ?? p.estimatedResellPrice ?? p.price;
  const amazonFees    = p.amazonFees ?? p.fees * 0.7;
  const prepFee       = p.prepFee ?? 0;
  const taxAmt        = p.taxAmount ?? 0;
  const totalCosts    = amazonFees + prepFee + taxAmt;
  const netProfit     = resell - totalCosts - finalCost;
  const roi           = finalCost > 0 ? (netProfit / finalCost) * 100 : 0;

  const Row = ({ label, value, minus, bold, green }: { label: string; value: string; minus?: boolean; bold?: boolean; green?: boolean }) => (
    <div className={`flex justify-between text-xs py-0.5 ${bold ? 'font-semibold border-t border-gray-200 mt-1 pt-1.5' : ''}`}>
      <span className={minus ? 'text-red-500' : 'text-gray-500'}>{minus ? '− ' : ''}{label}</span>
      <span className={`font-medium ${green ? 'text-green-600' : bold ? 'text-gray-800' : 'text-gray-700'}`}>{value}</span>
    </div>
  );

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-3">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Profitability Formula</div>

      {/* Source cost */}
      <div>
        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Final Source Cost</div>
        {p.sourcePrice != null && <Row label="Source Price" value={formatCurrency(p.sourcePrice)} />}
        {discounts.map((d, i) => (
          <Row
            key={i}
            label={`${d.source} ${d.percentage ? `(${d.percentage}%)` : ''}${d.code ? ` [${d.code}]` : ''}`}
            value={`−${formatCurrency(d.amount)}`}
            minus
          />
        ))}
        <Row label="Final Cost" value={formatCurrency(finalCost)} bold />
      </div>

      {/* Deductions */}
      <div>
        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">From Resell Price ({formatCurrency(resell)})</div>
        <Row label="Amazon Fees" value={`−${formatCurrency(amazonFees)}`} minus />
        <Row label="Prep Fee"    value={`−${formatCurrency(prepFee)}`}    minus />
        <Row label="Tax Amount"  value={`−${formatCurrency(taxAmt)}`}     minus />
      </div>

      {/* Result */}
      <div className="border-t border-gray-200 pt-2 space-y-0.5">
        <div className="flex justify-between text-xs font-bold">
          <span className="text-gray-600">Net Profit</span>
          <span className={netProfit >= 0 ? 'text-green-600' : 'text-red-600'}>{formatCurrency(netProfit)}</span>
        </div>
        <div className="flex justify-between text-xs font-bold">
          <span className="text-gray-600">ROI</span>
          <span className={roi >= 30 ? 'text-green-600' : 'text-red-500'}>{roi.toFixed(1)}%</span>
        </div>
        <div className="text-[10px] text-gray-400 mt-1">
          ROI = (Net Profit ÷ Final Source Cost) × 100
        </div>
      </div>
    </div>
  );
}

// ─── Expanded Detail Panel ────────────────────────────────────────────────────

function DetailPanel({ p, saved, onSave, onUnsave }: {
  p: ProductRow;
  saved: boolean;
  onSave?: (id: string) => void;
  onUnsave?: (id: string) => void;
}) {
  const discounts = (p.availableDiscounts as Discount[] | null) ?? [];
  const amazonUrl = p.amazonUrl ?? `https://www.amazon.com/dp/${p.asin}`;
  const keepaUrl  = p.keepaLink ?? `https://keepa.com/#!product/1-${p.asin}`;

  return (
    <tr className="bg-green-50/20">
      <td colSpan={13} className="px-4 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Column 1 – Source & Discounts */}
          <div className="space-y-3">
            <Section title="Source Details">
              <DetailRow label="UPC"           value={p.upc ?? '—'} />
              <DetailRow label="Category"      value={p.category ?? '—'} />
              <DetailRow label="Source Retailer" value={p.sourceRetailer ?? '—'} />
              <DetailRow label="Source Price"  value={p.sourcePrice != null ? formatCurrency(p.sourcePrice) : '—'} />
              {p.sourceUrl && (
                <div>
                  <div className="text-[10px] text-gray-400 mb-0.5">Source URL</div>
                  <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1 truncate">
                    <ExternalLink className="w-3 h-3 flex-shrink-0" /><span className="truncate">{p.sourceRetailer ?? p.sourceUrl}</span>
                  </a>
                </div>
              )}
            </Section>

            <Section title="Available Discounts">
              {discounts.length === 0
                ? <p className="text-xs text-gray-400">No discounts found</p>
                : discounts.map((d, i) => (
                    <div key={i} className="flex justify-between text-xs py-0.5">
                      <span className="text-gray-600">
                        {d.source} <span className="text-gray-400">({d.type}{d.code ? ` · ${d.code}` : ''})</span>
                      </span>
                      <span className="font-medium text-green-700">
                        −{formatCurrency(d.amount)}{d.percentage ? ` (${d.percentage}%)` : ''}
                      </span>
                    </div>
                  ))}
              {discounts.length > 0 && (
                <div className="text-[10px] text-gray-400 mt-1">
                  Sources: {((p.discountSources as string[] | null) ?? []).join(', ')}
                </div>
              )}
            </Section>
          </div>

          {/* Column 2 – Amazon Data */}
          <div className="space-y-3">
            <Section title="Amazon Data">
              <DetailRow label="Buy Box Price"         value={p.buyBoxPrice != null ? formatCurrency(p.buyBoxPrice) : '—'} />
              <DetailRow label="Lowest Listed Price"   value={p.lowestListedPrice != null ? formatCurrency(p.lowestListedPrice) : '—'} />
              <DetailRow label="Est. Resell Price"     value={p.estimatedResellPrice != null ? formatCurrency(p.estimatedResellPrice) : '—'} />
              <DetailRow label="Amazon Fees"           value={p.amazonFees != null ? formatCurrency(p.amazonFees) : '—'} />
              <DetailRow label="Prep Fee"              value={p.prepFee != null ? formatCurrency(p.prepFee) : '—'} />
              <DetailRow label="Tax Amount"            value={p.taxAmount != null ? formatCurrency(p.taxAmount) : '—'} />
            </Section>

            <Section title="Seller Intelligence">
              <DetailRow label="BSR"             value={p.bsr != null ? `#${p.bsr.toLocaleString()}` : '—'} />
              <DetailRow label="BSR %"           value={p.bsrPercentage != null ? `Top ${p.bsrPercentage.toFixed(2)}%` : '—'} />
              <DetailRow label="Auto-Ungated"    value={<BoolCell val={p.autoUngated} />} />
              <DetailRow label="Buy Box Owner"   value={<BuyBoxBadge owner={p.buyBoxOwner} />} />
              <DetailRow label="Amazon Seller"   value={<BoolCell val={p.amazonIsSeller} />} />
              <DetailRow label="Amazon Owns BB"  value={<BoolCell val={p.amazonOwnsBuyBox} />} />
              <DetailRow label="IP Risk Score"   value={<IpBadge score={p.ipRiskScore} />} />
              <DetailRow label="Date Added"      value={new Date(p.createdAt).toLocaleDateString()} />
            </Section>

            <Section title="Links">
              <div className="flex flex-wrap gap-2">
                <a href={amazonUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-orange-600 hover:underline font-medium">
                  <ExternalLink className="w-3 h-3" />Amazon
                </a>
                <a href={keepaUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-purple-600 hover:underline font-medium">
                  <TrendingUp className="w-3 h-3" />Keepa History
                </a>
                {p.sourceUrl && (
                  <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium">
                    <ExternalLink className="w-3 h-3" />{p.sourceRetailer ?? 'Source'}
                  </a>
                )}
              </div>
              <div className="mt-2">
                <button
                  onClick={() => saved ? onUnsave?.(p.id) : onSave?.(p.id)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
                    saved
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {saved ? <><BookmarkCheck className="w-3.5 h-3.5" />Saved</> : <><Bookmark className="w-3.5 h-3.5" />Save for Later</>}
                </button>
              </div>
            </Section>
          </div>

          {/* Column 3 – Formula */}
          <div>
            <ProfitabilityFormula p={p} />
          </div>
        </div>
      </td>
    </tr>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-gray-400 whitespace-nowrap">{label}</span>
      <span className="font-medium text-gray-700 text-right">{value}</span>
    </div>
  );
}

// ─── Main Table ───────────────────────────────────────────────────────────────

export function ProductsTable({ products, savedIds = new Set(), onSave, onUnsave }: ProductsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!products.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
        <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">No products match your filters</p>
        <p className="text-sm text-gray-400 mt-1">Try adjusting the search or filter criteria</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: '1100px' }}>
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              {[
                'Product',
                'Category',
                'Source Retailer',
                'Source Price',
                'Final Cost',
                'Resell Price',
                'Amazon Fees',
                'Prep / Tax',
                'Net Profit',
                'ROI %',
                'BSR',
                'IP Risk',
                '',
              ].map((h) => (
                <th
                  key={h}
                  className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap first:px-4"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {products.map((p) => {
              const isExpanded = expandedId === p.id;
              const isSaved    = savedIds.has(p.id);
              const amazonUrl  = p.amazonUrl ?? `https://www.amazon.com/dp/${p.asin}`;

              return (
                <React.Fragment key={p.id}>
                  <tr
                    className="cursor-pointer hover:bg-gray-50/60 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  >
                    {/* Product */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3" style={{ minWidth: '220px' }}>
                        <ProductImage asin={p.asin} imageUrl={p.imageUrl} title={p.title} />
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 text-sm leading-tight line-clamp-1">{p.title}</div>
                          <div className="text-xs text-gray-400 font-mono mt-0.5">{p.asin}</div>
                          <ScoreBadge score={p.score} />
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-3 py-3">
                      <span className="text-xs text-gray-600">{p.category ?? '—'}</span>
                    </td>

                    {/* Source Retailer */}
                    <td className="px-3 py-3">
                      {p.sourceUrl ? (
                        <a
                          href={p.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium"
                        >
                          {p.sourceRetailer ?? 'Source'} <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-gray-600">{p.sourceRetailer ?? '—'}</span>
                      )}
                    </td>

                    {/* Source Price */}
                    <td className="px-3 py-3 text-right">
                      <div className="text-xs font-medium text-gray-900">
                        {p.sourcePrice != null ? formatCurrency(p.sourcePrice) : '—'}
                      </div>
                      {p.discountSources && (p.discountSources as string[]).length > 0 && (
                        <div className="text-[10px] text-green-600 mt-0.5">
                          {(p.discountSources as string[]).length} discount{(p.discountSources as string[]).length > 1 ? 's' : ''}
                        </div>
                      )}
                    </td>

                    {/* Final Cost */}
                    <td className="px-3 py-3 text-right">
                      <div className="text-xs font-semibold text-gray-900">
                        {p.finalCost != null ? formatCurrency(p.finalCost) : '—'}
                      </div>
                    </td>

                    {/* Resell Price */}
                    <td className="px-3 py-3 text-right">
                      <div className="text-xs text-gray-900">
                        {p.lowestListedPrice != null ? formatCurrency(p.lowestListedPrice) : formatCurrency(p.price)}
                      </div>
                      {p.buyBoxPrice != null && (
                        <div className="text-[10px] text-gray-400">BB: {formatCurrency(p.buyBoxPrice)}</div>
                      )}
                    </td>

                    {/* Amazon Fees */}
                    <td className="px-3 py-3 text-right">
                      <div className="text-xs text-gray-700">
                        {p.amazonFees != null ? formatCurrency(p.amazonFees) : '—'}
                      </div>
                    </td>

                    {/* Prep + Tax */}
                    <td className="px-3 py-3 text-right">
                      <div className="text-xs text-gray-700">
                        {p.prepFee != null && p.taxAmount != null
                          ? formatCurrency(p.prepFee + p.taxAmount)
                          : '—'}
                      </div>
                      {p.prepFee != null && p.taxAmount != null && (
                        <div className="text-[10px] text-gray-400">{formatCurrency(p.prepFee)} + {formatCurrency(p.taxAmount)}</div>
                      )}
                    </td>

                    {/* Net Profit */}
                    <td className="px-3 py-3 text-right">
                      <div className={`text-sm font-bold ${p.profit >= 10 ? 'text-green-600' : p.profit >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                        {formatCurrency(p.profit)}
                      </div>
                    </td>

                    {/* ROI */}
                    <td className="px-3 py-3 text-right">
                      <RoiBadge roi={p.roi} />
                    </td>

                    {/* BSR */}
                    <td className="px-3 py-3 text-right">
                      {p.bsr != null ? (
                        <>
                          <div className="text-xs text-gray-700">#{p.bsr.toLocaleString()}</div>
                          {p.bsrPercentage != null && (
                            <div className="text-[10px] text-gray-400">Top {p.bsrPercentage.toFixed(2)}%</div>
                          )}
                        </>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>

                    {/* IP Risk */}
                    <td className="px-3 py-3">
                      <IpBadge score={p.ipRiskScore} />
                    </td>

                    {/* Expand */}
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <a
                          href={amazonUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-all"
                          title="View on Amazon"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : p.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-all"
                          title={isExpanded ? 'Collapse' : 'Expand details'}
                        >
                          {isExpanded
                            ? <ChevronUp className="w-4 h-4" />
                            : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <DetailPanel p={p} saved={savedIds.has(p.id)} onSave={onSave} onUnsave={onUnsave} />
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
