'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Package, ChevronLeft, ChevronRight, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
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
  if (score === 'HIGH')   return <span className="flex items-center gap-1 text-xs text-red-400"><ShieldX className="w-3 h-3" />High</span>;
  if (score === 'MEDIUM') return <span className="flex items-center gap-1 text-xs text-amber-400"><ShieldAlert className="w-3 h-3" />Med</span>;
  return <span className="flex items-center gap-1 text-xs text-green-400"><ShieldCheck className="w-3 h-3" />Low</span>;
}

interface Props { products: ProductRow[]; total: number; page: number; pageSize: number; }

export function ProductsTable({ products, total, page, pageSize }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const totalPages = Math.ceil(total / pageSize);

  if (!products.length) {
    return (
      <div className="card py-16 text-center">
        <Package className="w-10 h-10 mx-auto mb-3" style={{ color: '#3f3f46' }} />
        <p className="font-medium" style={{ color: '#71717a' }}>No products found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '900px' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid #27272a', background: '#141417' }}>
                {['Product', 'Retailer', 'Source Price', 'Final Cost', 'Resell', 'Profit', 'ROI', 'BSR', 'IP Risk', 'Score', ''].map((h) => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const isExp = expanded === p.id;
                const { label, color } = scoreLabel(p.score);
                const amazonUrl = p.amazonUrl ?? buildAmazonUrl(p.asin);
                const discounts = (p.availableDiscounts as Discount[] | null) ?? [];
                return (
                  <React.Fragment key={p.id}>
                    <tr
                      className="cursor-pointer transition-colors"
                      style={{ borderBottom: '0.5px solid #27272a' }}
                      onClick={() => setExpanded(isExp ? null : p.id)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#1c1c1f')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="table-td">
                        <div className="flex items-center gap-3" style={{ minWidth: '180px' }}>
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                            style={{ background: '#27272a', border: '0.5px solid #3f3f46' }}
                          >
                            {p.imageUrl
                              ? <img src={p.imageUrl} alt={p.title} className="w-9 h-9 object-contain" />
                              : <Package className="w-4 h-4" style={{ color: '#52525b' }} />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-medium line-clamp-1" style={{ color: '#fafafa' }}>{p.title}</div>
                            <div className="text-[10px] font-mono" style={{ color: '#71717a' }}>{p.asin}</div>
                          </div>
                        </div>
                      </td>
                      <td className="table-td text-xs" style={{ color: '#a1a1aa' }}>{p.sourceRetailer ?? '—'}</td>
                      <td className="table-td text-right text-xs" style={{ color: '#fafafa' }}>{p.sourcePrice != null ? formatCurrency(p.sourcePrice) : '—'}</td>
                      <td className="table-td text-right text-xs font-medium" style={{ color: '#fafafa' }}>{p.finalCost != null ? formatCurrency(p.finalCost) : '—'}</td>
                      <td className="table-td text-right text-xs" style={{ color: '#fafafa' }}>{p.lowestFbaPrice != null ? formatCurrency(p.lowestFbaPrice) : formatCurrency(p.price)}</td>
                      <td className="table-td text-right">
                        <span className={`text-sm font-bold ${p.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(p.profit)}</span>
                      </td>
                      <td className="table-td text-right">
                        <span className={cn('badge text-xs font-bold', p.roi >= 60 ? 'bg-green-500/15 text-green-400' : p.roi >= 30 ? 'bg-blue-500/15 text-blue-400' : 'bg-red-500/15 text-red-400')}>
                          {formatPercent(p.roi)}
                        </span>
                      </td>
                      <td className="table-td text-right text-xs" style={{ color: '#a1a1aa' }}>{p.bsr != null ? `#${p.bsr.toLocaleString()}` : '—'}</td>
                      <td className="table-td"><IpBadge score={p.ipRiskScore} /></td>
                      <td className="table-td">
                        <div className={`text-center ${color}`}>
                          <div className="text-base font-black leading-none">{p.score}</div>
                          <div className="text-[10px]">{label}</div>
                        </div>
                      </td>
                      <td className="table-td" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <a href={amazonUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg transition-all" style={{ color: '#71717a' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#a78bfa'; e.currentTarget.style.background = 'rgba(124,58,237,0.1)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#71717a'; e.currentTarget.style.background = 'transparent'; }}>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button onClick={() => setExpanded(isExp ? null : p.id)} className="p-1.5 rounded-lg transition-all" style={{ color: '#71717a' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.background = '#27272a'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#71717a'; e.currentTarget.style.background = 'transparent'; }}>
                            {isExp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExp && (
                      <tr style={{ background: '#0d0d10', borderBottom: '0.5px solid #27272a' }}>
                        <td colSpan={11} className="px-4 py-3">
                          <div className="grid md:grid-cols-3 gap-3 text-xs" style={{ color: '#fafafa' }}>
                            <div>
                              <div className="text-[10px] uppercase font-semibold mb-1" style={{ color: '#71717a' }}>Source Details</div>
                              <div className="space-y-0.5">
                                {p.category && <div><span style={{ color: '#71717a' }}>Category:</span> {p.category}</div>}
                                {discounts.map((d, i) => (
                                  <div key={i} className="text-green-400">− {d.source}: −{formatCurrency(d.amount)}{d.percentage ? ` (${d.percentage}%)` : ''}</div>
                                ))}
                                {p.sourceUrl && <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline" style={{ color: '#a78bfa' }}><ExternalLink className="w-3 h-3" />{p.sourceRetailer ?? 'Source'}</a>}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase font-semibold mb-1" style={{ color: '#71717a' }}>Amazon Data</div>
                              <div className="space-y-0.5">
                                {p.buyBoxPrice != null && <div><span style={{ color: '#71717a' }}>Buy Box:</span> {formatCurrency(p.buyBoxPrice)}</div>}
                                {p.bsrPercentage != null && <div><span style={{ color: '#71717a' }}>BSR %:</span> Top {p.bsrPercentage.toFixed(2)}%</div>}
                                <div><span style={{ color: '#71717a' }}>Amazon Sells:</span> {p.amazonOwnsBuyBox ? 'Yes ⚠️' : 'No ✓'}</div>
                                <div><span style={{ color: '#71717a' }}>Auto-Ungated:</span> {p.autoUngated ? 'Yes ✓' : 'No'}</div>
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase font-semibold mb-1" style={{ color: '#71717a' }}>Fee Breakdown</div>
                              <div className="space-y-0.5">
                                {p.amazonFees != null && <div><span style={{ color: '#71717a' }}>Amazon Fees:</span> {formatCurrency(p.amazonFees)}</div>}
                                {p.prepFee    != null && <div><span style={{ color: '#71717a' }}>Prep Fee:</span> {formatCurrency(p.prepFee)}</div>}
                                {p.taxAmount  != null && <div><span style={{ color: '#71717a' }}>Tax:</span> {formatCurrency(p.taxAmount)}</div>}
                                <div className="font-semibold pt-1 mt-1" style={{ borderTop: '0.5px solid #3f3f46' }}>
                                  <span style={{ color: '#71717a' }}>Net Profit:</span> <span className={p.profit >= 0 ? 'text-green-400' : 'text-red-400'}>{formatCurrency(p.profit)}</span>
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
          <span style={{ color: '#71717a' }}>{total.toLocaleString()} total products</span>
          <div className="flex items-center gap-2">
            <a href={`?page=${page - 1}`} className={cn('btn-secondary text-xs py-1.5', page <= 1 && 'pointer-events-none opacity-40')}>
              <ChevronLeft className="w-3.5 h-3.5" />Prev
            </a>
            <span className="px-2" style={{ color: '#a1a1aa' }}>Page {page} / {totalPages}</span>
            <a href={`?page=${page + 1}`} className={cn('btn-secondary text-xs py-1.5', page >= totalPages && 'pointer-events-none opacity-40')}>
              Next<ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
