'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronDown, ChevronUp, ExternalLink, TrendingUp,
  ShieldCheck, ShieldAlert, ShieldX, Bookmark, BookmarkCheck,
  Package, Check, X, Minus, ChevronLeft, ChevronRight, Trash2, Loader2,
} from 'lucide-react';
import { formatCurrency, formatPercent, cn } from '@/lib/utils';
import { discountUrl } from '@/lib/discount-urls';
import { scoreLabel } from '@/engines/scoring';
import { ungatingOutlook } from '@/engines/gating';
import type { Discount, Plan } from '@/types';

export interface LeadRow {
  id: string;
  score: number;
  status: string;
  createdAt: string;
  product: {
    id: string;
    asin: string;
    title: string;
    brand?: string | null;
    category?: string | null;
    imageUrl?: string | null;
    sourceRetailer?: string | null;
    sourcePrice?: number | null;
    sourceListPrice?: number | null;
    onSale?: boolean | null;
    finalCost?: number | null;
    lowestFbaPrice?: number | null;
    buyBoxPrice?: number | null;
    amazonFees?: number | null;
    prepFee?: number | null;
    taxAmount?: number | null;
    profit: number;
    roi: number;
    margin?: number | null;
    bsr?: number | null;
    bsrPercentage?: number | null;
    demandLevel: string;
    gatingRisk: string;
    ipRiskScore?: string | null;
    autoUngated?: boolean | null;
    isBrandRestricted?: boolean | null;
    isCategoryGated?: boolean | null;
    hasHazmat?: boolean | null;
    amazonOwnsBuyBox?: boolean | null;
    buyBoxOwner?: string | null;
    matchConfidence?: number | null;
    matchMethod?: string | null;
    availableDiscounts?: any;
    discountSources?: any;
    keepaLink?: string | null;
    amazonUrl?: string | null;
    score: number;
    validationPassed?: boolean | null;
    identityScore?: number | null;
    urlScore?: number | null;
    priceScore?: number | null;
    inventoryScore?: number | null;
  };
}

function IpBadge({ score }: { score?: string | null }) {
  if (score === 'HIGH')   return <span className="flex items-center gap-1 text-xs text-red-400 font-medium"><ShieldX className="w-3.5 h-3.5" />High</span>;
  if (score === 'MEDIUM') return <span className="flex items-center gap-1 text-xs text-amber-400 font-medium"><ShieldAlert className="w-3.5 h-3.5" />Med</span>;
  return <span className="flex items-center gap-1 text-xs text-green-400 font-medium"><ShieldCheck className="w-3.5 h-3.5" />Low</span>;
}

function DemandBadge({ level }: { level: string }) {
  if (level === 'UNKNOWN') {
    return (
      <span className="badge text-xs bg-slate-700 text-slate-400" title="No sales-rank data available for this ASIN — demand could not be assessed">
        Unknown
      </span>
    );
  }
  const cls = level === 'HIGH' ? 'bg-green-500/15 text-green-400' : level === 'MEDIUM' ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400';
  return <span className={`badge text-xs ${cls}`}>{level}</span>;
}

function UngatingBadge({ product }: { product: LeadRow['product'] }) {
  const o = ungatingOutlook(product);
  const cls = o.tone === 'good' ? 'bg-green-500/15 text-green-400'
            : o.tone === 'ok'   ? 'bg-blue-500/15 text-blue-400'
            : o.tone === 'warn' ? 'bg-amber-500/15 text-amber-400'
            :                     'bg-red-500/15 text-red-400';
  return <span className={`badge text-xs ${cls}`} title={o.hint}>{o.label}</span>;
}

function ScorePill({ score }: { score: number }) {
  const { label, color } = scoreLabel(score);
  return (
    <div className={`text-center ${color}`}>
      <div className="text-lg font-black leading-none">{score}</div>
      <div className="text-[10px] font-semibold">{label}</div>
    </div>
  );
}

function ProductImage({ asin, imageUrl, title }: { asin: string; imageUrl?: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return (
    <div className="w-10 h-10 rounded-lg border bg-slate-800/40 flex items-center justify-center flex-shrink-0">
      <Package className="w-4 h-4 text-slate-600" />
    </div>
  );
  return (
    <div className="w-10 h-10 rounded-lg border bg-slate-900 flex items-center justify-center flex-shrink-0 overflow-hidden">
      <img
        src={imageUrl ?? `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SL75_.jpg`}
        alt={title}
        className="w-10 h-10 object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function ExpandedPanel({ lead, isOwner, onDelete }: {
  lead: LeadRow;
  isOwner: boolean;
  onDelete: (productId: string) => Promise<boolean>;
}) {
  const p = lead.product;
  const discounts = (p.availableDiscounts as Discount[] | null) ?? [];
  const resell    = p.lowestFbaPrice ?? 0;
  const amazonUrl = p.amazonUrl ?? `https://www.amazon.com/dp/${p.asin}`;
  const keepaUrl  = p.keepaLink ?? `https://keepa.com/#!product/1-${p.asin}`;
  const [deleting, setDeleting] = useState(false);

  return (
    <tr className="bg-slate-800/40">
      <td colSpan={12} className="px-4 py-4">
        <div className="grid md:grid-cols-3 gap-4">
          {/* Profitability */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Profitability Formula</div>
            {p.sourcePrice != null && (
              <div className="flex justify-between text-xs py-0.5">
                <span className="text-slate-400">Source Price</span>
                <span>{formatCurrency(p.sourcePrice)}</span>
              </div>
            )}
            {discounts.map((d, i) => {
              const url = discountUrl(d.source, lead.product.sourceRetailer ?? '', d.url);
              const isCashback = d.type === 'cashback' || d.type === 'rewards';
              return (
                <div key={i} className="flex justify-between text-xs py-0.5 gap-2">
                  <span className="text-green-400 flex items-center gap-1 min-w-0 flex-wrap">
                    <span>−</span>
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-green-400 hover:text-green-400 flex items-center gap-0.5">
                        {d.source}<ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                      </a>
                    ) : <span>{d.source}</span>}
                    {d.percentage ? (
                      <span title={isCashback ? 'Rate at scan time — verify current rate before purchasing' : undefined}>
                        {isCashback ? `~${d.percentage}%` : `${d.percentage}%`}
                      </span>
                    ) : null}
                    {d.code && <span className="font-mono bg-green-500/10 border border-green-500/30 px-1 rounded text-[10px]">{d.code}</span>}
                  </span>
                  <span className="text-green-400 flex-shrink-0">−{formatCurrency(d.amount)}</span>
                </div>
              );
            })}
            {discounts.some((d) => d.type === 'cashback' || d.type === 'rewards') && (
              <p className="text-[10px] text-amber-400 mt-1">~ Cashback rates at scan time — verify before purchasing.</p>
            )}
            {p.finalCost != null && (
              <div className="flex justify-between text-xs font-semibold border-t border-slate-800 pt-1 mt-1">
                <span>Final Cost</span><span>{formatCurrency(p.finalCost)}</span>
              </div>
            )}
            <div className="my-2 border-t border-slate-800" />
            <div className="text-[10px] text-slate-500 mb-1">From resell price {resell ? formatCurrency(resell) : '—'}</div>
            {p.amazonFees != null && <div className="flex justify-between text-xs py-0.5"><span className="text-slate-400">Amazon Fees</span><span className="text-red-400">−{formatCurrency(p.amazonFees)}</span></div>}
            {p.prepFee   != null && <div className="flex justify-between text-xs py-0.5"><span className="text-slate-400">Prep Fee</span><span className="text-red-400">−{formatCurrency(p.prepFee)}</span></div>}
            {p.taxAmount != null && <div className="flex justify-between text-xs py-0.5"><span className="text-slate-400">Tax</span><span className="text-red-400">−{formatCurrency(p.taxAmount)}</span></div>}
            <div className="flex justify-between text-xs font-bold border-t border-slate-800 pt-1 mt-1">
              <span>Net Profit</span>
              <span className={p.profit >= 0 ? 'text-green-400' : 'text-red-400'}>{formatCurrency(p.profit)}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">ROI = {formatPercent(p.roi)}</div>
          </div>

          {/* Amazon data */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-1.5">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Market Data</div>
            {[
              ['Buy Box', p.buyBoxPrice != null ? formatCurrency(p.buyBoxPrice) : '—'],
              ['Lowest FBA', p.lowestFbaPrice != null ? formatCurrency(p.lowestFbaPrice) : '—'],
              ['BSR', p.bsr != null ? `#${p.bsr.toLocaleString()}` : '—'],
              ['BSR %', p.bsrPercentage != null ? `Top ${p.bsrPercentage.toFixed(2)}%` : '—'],
              ['Buy Box Owner', p.buyBoxOwner ?? '—'],
              ['Amazon Sells', p.amazonOwnsBuyBox ? 'Yes ⚠️' : 'No ✓'],
              ['Auto-Ungated', p.autoUngated ? 'Yes ✓' : 'No'],
              ['Match Confidence', p.matchConfidence != null ? `${p.matchConfidence.toFixed(0)}%` : '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-xs">
                <span className="text-slate-500">{label}</span>
                <span className="font-medium text-slate-200">{value}</span>
              </div>
            ))}
          </div>

          {/* Links & validation */}
          <div className="space-y-3">
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Validation</div>
              {[
                ['Identity', p.identityScore],
                ['URL', p.urlScore],
                ['Price', p.priceScore],
                ['Inventory', p.inventoryScore],
              ].map(([label, val]) => (
                <div key={label as string} className="flex items-center justify-between text-xs py-0.5">
                  <span className="text-slate-500">{label as string}</span>
                  <span className={`font-medium ${(val as number ?? 0) >= 95 ? 'text-green-400' : 'text-red-400'}`}>
                    {val != null ? `${(val as number).toFixed(0)}%` : '—'}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={amazonUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1.5">
                <ExternalLink className="w-3 h-3" />Amazon
              </a>
              <a href={keepaUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1.5">
                <TrendingUp className="w-3 h-3" />Keepa
              </a>
              <Link href={`/dashboard/leads/${lead.id}`} className="btn-primary text-xs py-1.5">
                View Detail →
              </Link>
              {isOwner && (
                <button
                  onClick={async () => {
                    if (!confirm('Remove this product from the lead feed? This deletes the product and its lead and cannot be undone. It will disappear for all users.')) return;
                    setDeleting(true);
                    const ok = await onDelete(p.id);
                    if (!ok) setDeleting(false);
                  }}
                  disabled={deleting}
                  className="btn-secondary text-xs py-1.5 text-red-400 hover:text-red-300 ml-auto"
                >
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

interface LeadsTableProps {
  leads: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  orgPlan: Plan;
  isOwner?: boolean;
}

export function LeadsTable({ leads, total, page, pageSize, orgPlan, isOwner = false }: LeadsTableProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const totalPages = Math.ceil(total / pageSize);

  async function deleteProduct(productId: string): Promise<boolean> {
    const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    return res.ok;
  }

  if (!leads.length) {
    return (
      <div className="card py-16 text-center">
        <TrendingUp className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 font-medium">No leads match your filters</p>
        <p className="text-sm text-slate-500 mt-1">Run a scanner job to discover new opportunities</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '960px' }}>
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/40">
                {['Product', 'Retailer', 'Cost', 'Resell', 'Amazon Fees', 'Profit', 'ROI', 'Demand', 'IP Risk', 'Ungating', 'Score', ''].map((h) => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {leads.map((lead) => {
                const p          = lead.product;
                const isExpanded = expanded === lead.id;

                return (
                  <React.Fragment key={lead.id}>
                    <tr
                      className="cursor-pointer hover:bg-slate-800/40 transition-colors"
                      onClick={() => setExpanded(isExpanded ? null : lead.id)}
                    >
                      {/* Product */}
                      <td className="table-td">
                        <div className="flex items-center gap-3" style={{ minWidth: '200px' }}>
                          <ProductImage asin={p.asin} imageUrl={p.imageUrl} title={p.title} />
                          <div className="min-w-0">
                            <div className="font-medium text-slate-50 text-sm leading-tight line-clamp-1">{p.title}</div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">{p.asin}</div>
                            {(p.matchMethod === 'UPC' || p.matchMethod === 'EAN') ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-green-400 mt-0.5"><ShieldCheck className="w-3 h-3" />Barcode match</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 mt-0.5" title="Title-based match — verify the product, variant, and quantity before buying">
                                <ShieldAlert className="w-3 h-3" />Verify match
                              </span>
                            )}
                            {p.onSale && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-400 mt-0.5 ml-2" title="Retailer has this on sale / rollback / clearance">
                                🏷 SALE{p.sourceListPrice != null ? ` · was ${formatCurrency(p.sourceListPrice)}` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Retailer */}
                      <td className="table-td text-slate-300 text-xs">{p.sourceRetailer ?? '—'}</td>

                      {/* Cost */}
                      <td className="table-td text-right">
                        <div className="text-xs font-medium">{p.finalCost != null ? formatCurrency(p.finalCost) : '—'}</div>
                        {p.sourcePrice != null && p.finalCost != null && p.sourcePrice > p.finalCost && (
                          <div className="text-[10px] text-green-400">was {formatCurrency(p.sourcePrice)}</div>
                        )}
                      </td>

                      {/* Resell */}
                      <td className="table-td text-right">
                        <div className="text-xs font-medium">{p.lowestFbaPrice != null ? formatCurrency(p.lowestFbaPrice) : '—'}</div>
                        {p.buyBoxPrice != null && <div className="text-[10px] text-slate-500">BB: {formatCurrency(p.buyBoxPrice)}</div>}
                      </td>

                      {/* Amazon Fees */}
                      <td className="table-td text-right text-xs text-slate-300">
                        {p.amazonFees != null ? formatCurrency(p.amazonFees) : '—'}
                      </td>

                      {/* Profit */}
                      <td className="table-td text-right">
                        <div className={`text-sm font-bold ${p.profit >= 10 ? 'text-green-400' : p.profit >= 0 ? 'text-blue-600' : 'text-red-400'}`}>
                          {formatCurrency(p.profit)}
                        </div>
                      </td>

                      {/* ROI */}
                      <td className="table-td text-right">
                        <span className={cn(
                          'badge text-xs font-bold',
                          p.roi >= 60 ? 'bg-green-500/15 text-green-400' :
                          p.roi >= 30 ? 'bg-blue-500/15 text-blue-400' :
                          'bg-red-500/15 text-red-400',
                        )}>
                          {formatPercent(p.roi)}
                        </span>
                      </td>

                      {/* Demand */}
                      <td className="table-td"><DemandBadge level={p.demandLevel} /></td>

                      {/* IP Risk */}
                      <td className="table-td"><IpBadge score={p.ipRiskScore} /></td>

                      {/* Ungating outlook */}
                      <td className="table-td"><UngatingBadge product={p} /></td>

                      {/* Score */}
                      <td className="table-td"><ScorePill score={lead.score} /></td>

                      {/* Expand */}
                      <td className="table-td" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setExpanded(isExpanded ? null : lead.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-green-400 hover:bg-green-500/10 transition-all"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>

                    {isExpanded && <ExpandedPanel lead={lead} isOwner={isOwner} onDelete={deleteProduct} />}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">
            {((page - 1) * pageSize + 1).toLocaleString()}–{Math.min(page * pageSize, total).toLocaleString()} of {total.toLocaleString()} leads
          </span>
          <div className="flex items-center gap-2">
            <a
              href={`?page=${page - 1}`}
              className={cn('btn-secondary text-xs py-1.5', page <= 1 && 'pointer-events-none opacity-40')}
            >
              <ChevronLeft className="w-3.5 h-3.5" />Prev
            </a>
            <span className="text-slate-300 px-2">Page {page} of {totalPages}</span>
            <a
              href={`?page=${page + 1}`}
              className={cn('btn-secondary text-xs py-1.5', page >= totalPages && 'pointer-events-none opacity-40')}
            >
              Next<ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
