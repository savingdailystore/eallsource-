'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Package, ChevronLeft, ChevronRight, ShieldCheck, ShieldAlert, ShieldX, ArrowUpRight } from 'lucide-react';
import { formatCurrency, formatPercent, cn, buildAmazonUrl } from '@/lib/utils';
import { scoreLabel } from '@/engines/scoring';
import type { Discount } from '@/types';

export interface ProductRow {
  id: string; asin: string; title: string; brand?: string | null; category?: string | null;
  imageUrl?: string | null; sourceUrl?: string | null; sourceRetailer?: string | null;
  sourcePrice?: number | null; finalCost?: number | null; availableDiscounts?: any;
  discountSources?: any; amazonUrl?: string | null; buyBoxPrice?: number | null;
  lowestFbaPrice?: number | null; estimatedResellPrice?: number | null;
  price: number; amazonFees?: number | null; prepFee?: number | null; taxAmount?: number | null;
  fees: number; profit: number; roi: number; bsr?: number | null; bsrPercentage?: number | null;
  demandLevel: string; gatingRisk: string; ipRiskScore?: string | null;
  autoUngated?: boolean | null; amazonOwnsBuyBox?: boolean | null; buyBoxOwner?: string | null;
  keepaLink?: string | null; score: number; createdAt: string;
}

function IpBadge({ score }: { score?: string | null }) {
  if (score === 'HIGH')   return <span className="flex items-center gap-1 text-xs text-red-600"><ShieldX className="w-3 h-3" />High</span>;
  if (score === 'MEDIUM') return <span className="flex items-center gap-1 text-xs text-amber-600"><ShieldAlert className="w-3 h-3" />Med</span>;
  return <span className="flex items-center gap-1 text-xs text-green-600"><ShieldCheck className="w-3 h-3" />Low</span>;
}

interface Props { products: ProductRow[]; total: number; page: number; pageSize: number; }

export function ProductsTable({ products, total, page, pageSize }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const totalPages = Math.ceil(total / pageSize);

  if (!products.length) {
    return (
      <div className="card py-16 text-center">
        <Package className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">No products found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '900px' }}>
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Product', 'Retailer', 'Source Price', 'Final Cost', 'Resell', 'Profit', 'ROI', 'BSR', 'IP Risk', 'Score', ''].map((h) => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => {
                const isExp = expanded === p.id;
                const { label, color } = scoreLabel(p.score);
                const amazonUrl = p.amazonUrl ?? buildAmazonUrl(p.asin);
                const discounts = (p.availableDiscounts as Discount[] | null) ?? [];
                return (
                  <React.Fragment key={p.id}>
                    <tr className="cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setExpanded(isExp ? null : p.id)}>
                      <td className="table-td">
                        <div className="flex items-center gap-3" style={{ minWidth: '180px' }}>
                          <div className="w-9 h-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {p.imageUrl
                              ? <img src={p.imageUrl} alt={p.title} className="w-9 h-9 object-contain" />
                              : <Package className="w-4 h-4 text-slate-300" />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-900 line-clamp-1">{p.title}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{p.asin}</div>
                          </div>
                        </div>
                      </td>
                      <td className="table-td text-xs text-slate-500">{p.sourceRetailer ?? '—'}</td>
                      <td className="table-td text-right text-xs text-slate-700">{p.sourcePrice != null ? formatCurrency(p.sourcePrice) : '—'}</td>
                      <td className="table-td text-right text-xs font-medium text-slate-900">{p.finalCost != null ? formatCurrency(p.finalCost) : '—'}</td>
                      <td className="table-td text-right text-xs text-slate-700">{p.lowestFbaPrice != null ? formatCurrency(p.lowestFbaPrice) : formatCurrency(p.price)}</td>
                      <td className="table-td text-right">
                        <span className={`text-sm font-bold ${p.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(p.profit)}</span>
                      </td>
                      <td className="table-td text-right">
                        <span className={cn('badge text-xs font-bold', p.roi >= 60 ? 'bg-green-100 text-green-700' : p.roi >= 30 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700')}>
                          {formatPercent(p.roi)}
                        </span>
                      </td>
                      <td className="table-td text-right text-xs text-slate-500">{p.bsr != null ? `#${p.bsr.toLocaleString()}` : '—'}</td>
                      <td className="table-td"><IpBadge score={p.ipRiskScore} /></td>
                      <td className="table-td">
                        <div className={`text-center ${color}`}>
                          <div className="text-base font-black leading-none">{p.score}</div>
                          <div className="text-[10px]">{label}</div>
                        </div>
                      </td>
                      <td className="table-td" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 items-center">
                          <a href={`/dashboard/products/${p.id}`} className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-all" title="View detail">
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </a>
                          <a href={amazonUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-all" title="View on Amazon">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button onClick={() => setExpanded(isExp ? null : p.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                            {isExp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExp && (
                      <tr className="bg-slate-50">
                        <td colSpan={11} className="px-4 py-3">
                          <div className="grid md:grid-cols-3 gap-3 text-xs text-slate-700">
                            <div>
                              <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Source Details</div>
                              <div className="space-y-0.5">
                                {p.category && <div><span className="text-slate-400">Category:</span> {p.category}</div>}
                                {discounts.map((d, i) => (
                                  <div key={i} className="text-green-600">− {d.source}: −{formatCurrency(d.amount)}{d.percentage ? ` (${d.percentage}%)` : ''}</div>
                                ))}
                                {p.sourceUrl && <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline flex items-center gap-1"><ExternalLink className="w-3 h-3" />{p.sourceRetailer ?? 'Source'}</a>}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Amazon Data</div>
                              <div className="space-y-0.5">
                                {p.buyBoxPrice != null && <div><span className="text-slate-400">Buy Box:</span> {formatCurrency(p.buyBoxPrice)}</div>}
                                {p.bsrPercentage != null && <div><span className="text-slate-400">BSR %:</span> Top {p.bsrPercentage.toFixed(2)}%</div>}
                                <div><span className="text-slate-400">Amazon Sells:</span> {p.amazonOwnsBuyBox ? 'Yes ⚠️' : 'No ✓'}</div>
                                <div><span className="text-slate-400">Auto-Ungated:</span> {p.autoUngated ? 'Yes ✓' : 'No'}</div>
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Fee Breakdown</div>
                              <div className="space-y-0.5">
                                {p.amazonFees != null && <div><span className="text-slate-400">Amazon Fees:</span> {formatCurrency(p.amazonFees)}</div>}
                                {p.prepFee    != null && <div><span className="text-slate-400">Prep Fee:</span> {formatCurrency(p.prepFee)}</div>}
                                {p.taxAmount  != null && <div><span className="text-slate-400">Tax:</span> {formatCurrency(p.taxAmount)}</div>}
                                <div className="font-semibold border-t border-slate-200 pt-1 mt-1">
                                  <span className="text-slate-400">Net Profit:</span> <span className={p.profit >= 0 ? 'text-green-600' : 'text-red-500'}>{formatCurrency(p.profit)}</span>
                                </div>
                              </div>
                            </div>
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">{total.toLocaleString()} total products</span>
          <div className="flex items-center gap-2">
            <a href={`?page=${page - 1}`} className={cn('btn-secondary text-xs py-1.5', page <= 1 && 'pointer-events-none opacity-40')}>
              <ChevronLeft className="w-3.5 h-3.5" />Prev
            </a>
            <span className="text-slate-500 px-2">Page {page} / {totalPages}</span>
            <a href={`?page=${page + 1}`} className={cn('btn-secondary text-xs py-1.5', page >= totalPages && 'pointer-events-none opacity-40')}>
              Next<ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
