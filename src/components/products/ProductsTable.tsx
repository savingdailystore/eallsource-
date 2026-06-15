'use client';

import React, { useState } from 'react';
import {
  ExternalLink, Bookmark, BookmarkCheck, ShieldCheck, ShieldAlert,
  ShieldX, TrendingUp, TrendingDown, Minus, Package, MoreHorizontal,
  Sun, Snowflake, Flame, Zap,
} from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber, truncate } from '@/lib/utils';
import type { Product } from '@/types';

interface ProductsTableProps {
  products: Product[];
  savedIds?: Set<string>;
  onSave?: (productId: string) => void;
  onUnsave?: (productId: string) => void;
  onViewDetail?: (product: Product) => void;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function RoiBadge({ roi }: { roi: number }) {
  if (roi >= 60) return <span className="inline-flex items-center text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{formatPercent(roi)}</span>;
  if (roi >= 40) return <span className="inline-flex items-center text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{formatPercent(roi)}</span>;
  return <span className="inline-flex items-center text-xs font-bold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">{formatPercent(roi)}</span>;
}

function IpBadge({ score }: { score: Product['ipRiskScore'] }) {
  if (score === 'LOW') return <span className="flex items-center gap-1 text-xs text-green-700"><ShieldCheck className="w-3.5 h-3.5" />Low</span>;
  if (score === 'MEDIUM') return <span className="flex items-center gap-1 text-xs text-yellow-700"><ShieldAlert className="w-3.5 h-3.5" />Med</span>;
  return <span className="flex items-center gap-1 text-xs text-red-700"><ShieldX className="w-3.5 h-3.5" />High</span>;
}

function BuyBoxBadge({ owner }: { owner: Product['buyBoxOwner'] }) {
  const map = {
    AMAZON: 'bg-orange-100 text-orange-700',
    FBA_SELLER: 'bg-green-100 text-green-700',
    FBM_SELLER: 'bg-blue-100 text-blue-700',
    NONE: 'bg-gray-100 text-gray-600',
  };
  const labels = { AMAZON: 'Amazon', FBA_SELLER: 'FBA', FBM_SELLER: 'FBM', NONE: 'None' };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[owner]}`}>
      {labels[owner]}
    </span>
  );
}

function BsrTrendBadge({ trend }: { trend: Product['bsrTrend'] }) {
  if (!trend || trend === 'STABLE') {
    return <span className="flex items-center gap-0.5 text-xs text-gray-400"><Minus className="w-3 h-3" />Stable</span>;
  }
  if (trend === 'TRENDING_UP') {
    return <span className="flex items-center gap-0.5 text-xs text-green-600 font-medium"><TrendingUp className="w-3 h-3" />Rising</span>;
  }
  return <span className="flex items-center gap-0.5 text-xs text-red-500 font-medium"><TrendingDown className="w-3 h-3" />Slowing</span>;
}

const SEASON_CONFIG: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
  YEAR_ROUND:  { label: 'Year-Round',  cls: 'bg-gray-100 text-gray-500',    Icon: Sun },
  PEAK_SEASON: { label: 'Peak Season', cls: 'bg-orange-100 text-orange-600', Icon: Flame },
  OFF_SEASON:  { label: 'Off Season',  cls: 'bg-blue-100 text-blue-500',     Icon: Snowflake },
  TRENDING:    { label: 'Trending Now', cls: 'bg-purple-100 text-purple-600', Icon: Zap },
};

function SeasonBadge({ season }: { season: Product['seasonality'] }) {
  if (!season) return null;
  const cfg = SEASON_CONFIG[season];
  if (!cfg) return null;
  const { label, cls, Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cls}`}>
      <Icon className="w-2.5 h-2.5" />{label}
    </span>
  );
}

function ProductImage({ asin, imageUrl, name }: { asin: string; imageUrl?: string; name: string }) {
  const src = imageUrl || `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SL75_.jpg`;
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="w-11 h-11 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center flex-shrink-0">
        <Package className="w-5 h-5 text-gray-300" />
      </div>
    );
  }

  return (
    <div className="w-11 h-11 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
      <img
        src={src}
        alt={name}
        className="w-11 h-11 object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

// ─── main table ───────────────────────────────────────────────────────────────

export function ProductsTable({
  products,
  savedIds = new Set(),
  onSave,
  onUnsave,
}: ProductsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!products.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
        <TrendingUp className="w-10 h-10 text-gray-200 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">No products match your filters</p>
        <p className="text-sm text-gray-400 mt-1">Try adjusting the search or filter criteria</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Product</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Retailer</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Source Cost</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Resell Price</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Amazon Fees</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Net Profit</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">ROI</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">BSR / Trend</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Buy Box</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">IP Risk</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {products.map((p) => {
              const isExpanded = expandedId === p.id;
              const isSaved = savedIds.has(p.id);

              return (
                <React.Fragment key={p.id}>
                  <tr
                    className="product-row cursor-pointer hover:bg-gray-50/60 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  >
                    {/* Product — image + name + category + season + cat rank */}
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <ProductImage asin={p.asin} imageUrl={p.imageUrl} name={p.name} />
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 text-sm leading-tight mb-0.5">
                            {truncate(p.name, 42)}
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-gray-400 font-mono">{p.asin}</span>
                            <span className="text-xs text-gray-300">·</span>
                            <span className="text-xs text-gray-400">{p.category}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <SeasonBadge season={p.seasonality} />
                            {p.categoryRank && p.categoryRankName && (
                              <span className="text-[10px] text-gray-400">
                                #{p.categoryRank} in {p.categoryRankName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Retailer */}
                    <td className="px-3 py-3">
                      <a
                        href={p.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-medium"
                      >
                        {p.sourceRetailer}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>

                    {/* Source Cost */}
                    <td className="px-3 py-3 text-right">
                      <div className="text-gray-900 font-medium">{formatCurrency(p.finalCost)}</div>
                      {p.finalCost < p.sourcePrice && (
                        <div className="text-xs text-gray-400 line-through">{formatCurrency(p.sourcePrice)}</div>
                      )}
                    </td>

                    {/* Resell Price */}
                    <td className="px-3 py-3 text-right">
                      <div className="text-gray-900">{formatCurrency(p.estimatedResellPrice)}</div>
                      {p.buyBoxPrice && (
                        <div className="text-xs text-gray-400">BB: {formatCurrency(p.buyBoxPrice)}</div>
                      )}
                    </td>

                    {/* Amazon Fees */}
                    <td className="px-3 py-3 text-right">
                      <div className="text-gray-700">{formatCurrency(p.amazonFees)}</div>
                      <div className="text-xs text-gray-400">+prep/tax: {formatCurrency(p.prepFee + p.taxAmount)}</div>
                    </td>

                    {/* Net Profit */}
                    <td className="px-3 py-3 text-right">
                      <div className={`font-bold ${p.netProfit >= 10 ? 'text-green-600' : p.netProfit >= 5 ? 'text-blue-600' : 'text-gray-700'}`}>
                        {formatCurrency(p.netProfit)}
                      </div>
                    </td>

                    {/* ROI */}
                    <td className="px-3 py-3 text-right">
                      <RoiBadge roi={p.roi} />
                    </td>

                    {/* BSR + trend */}
                    <td className="px-3 py-3 text-right">
                      <div className="text-gray-700 font-medium">{p.bsr ? formatNumber(p.bsr) : '—'}</div>
                      {p.bsrPercentage != null && (
                        <div className="text-xs text-gray-400">top {p.bsrPercentage.toFixed(2)}%</div>
                      )}
                      <div className="flex justify-end mt-0.5">
                        <BsrTrendBadge trend={p.bsrTrend} />
                      </div>
                    </td>

                    {/* Buy Box */}
                    <td className="px-3 py-3 text-center">
                      <BuyBoxBadge owner={p.buyBoxOwner} />
                    </td>

                    {/* IP Risk */}
                    <td className="px-3 py-3 text-center">
                      <IpBadge score={p.ipRiskScore} />
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => isSaved ? onUnsave?.(p.id) : onSave?.(p.id)}
                          className={`p-1.5 rounded-lg transition-all ${
                            isSaved
                              ? 'text-green-600 bg-green-50 hover:bg-green-100'
                              : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                          }`}
                          title={isSaved ? 'Remove from saved' : 'Save for later'}
                        >
                          {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                        </button>
                        <a
                          href={p.amazonUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-all"
                          title="View on Amazon"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : p.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {isExpanded && (
                    <tr className="bg-green-50/30">
                      <td colSpan={11} className="px-4 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                          <Detail label="UPC" value={p.upc ?? '—'} />
                          <Detail label="FBA Sellers" value={String(p.fbaSellers)} />
                          <Detail label="Total Sellers" value={String(p.totalSellers)} />
                          <Detail label="Amazon Is Seller" value={p.amazonIsSeller ? 'Yes' : 'No'} />
                          <Detail label="Amazon Owns Buy Box" value={p.amazonOwnsBuyBox ? 'Yes' : 'No'} />
                          <Detail label="Auto-Ungated" value={p.autoUngated ? 'Yes' : 'No'} />
                          <Detail label="Prep Fee" value={formatCurrency(p.prepFee)} />
                          <Detail label="Tax" value={formatCurrency(p.taxAmount)} />
                          <Detail label="BSR %" value={p.bsrPercentage != null ? `${p.bsrPercentage.toFixed(2)}%` : '—'} />
                          <Detail label="BSR Trend" value={p.bsrTrend === 'TRENDING_UP' ? 'Rising (more sales)' : p.bsrTrend === 'TRENDING_DOWN' ? 'Slowing (fewer sales)' : 'Stable'} />
                          <Detail label="Cat. Rank" value={p.categoryRank ? `#${p.categoryRank}` : '—'} />
                          <Detail label="Sub-Category" value={p.categoryRankName ?? '—'} />
                          <Detail label="Seasonality" value={p.seasonality ? SEASON_CONFIG[p.seasonality]?.label ?? p.seasonality : '—'} />
                          <Detail label="Discount Sources" value={p.discountSources?.join(', ') || 'None'} />
                          <div className="col-span-2">
                            <div className="text-xs text-gray-400 mb-1 font-medium">Links</div>
                            <div className="flex items-center gap-3">
                              <a href={p.amazonUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-600 hover:underline flex items-center gap-1">Amazon <ExternalLink className="w-3 h-3" /></a>
                              {p.keepaLink && <a href={p.keepaLink} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-600 hover:underline flex items-center gap-1">Keepa History <ExternalLink className="w-3 h-3" /></a>}
                              <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">{p.sourceRetailer} <ExternalLink className="w-3 h-3" /></a>
                            </div>
                          </div>
                          {p.availableDiscounts && p.availableDiscounts.length > 0 && (
                            <div className="col-span-2">
                              <div className="text-xs text-gray-400 mb-1 font-medium">Active Discounts</div>
                              <div className="flex flex-wrap gap-1.5">
                                {(p.availableDiscounts as Array<{ source: string; type: string; amount: number; percentage?: number; code?: string }>).map((d, i) => (
                                  <span key={i} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                    {d.source} {d.percentage ? `${d.percentage}%` : ''} {d.code ? `(${d.code})` : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-400 font-medium mb-0.5">{label}</div>
      <div className="text-sm text-gray-700 font-medium">{value}</div>
    </div>
  );
}
