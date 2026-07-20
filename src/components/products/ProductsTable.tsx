'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, ExternalLink, Package, ChevronLeft, ChevronRight, ShieldCheck, ShieldAlert, ShieldX, ArrowUpRight, Trash2, Loader2, ScanSearch } from 'lucide-react';
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
  hasIpComplaintHistory?: boolean | null;
  ipComplaintNote?: string | null;
}

function IpBadge({ score }: { score?: string | null }) {
  if (score === 'HIGH')   return <span className="flex items-center gap-1 text-xs text-red-400"><ShieldX className="w-3 h-3" />High</span>;
  if (score === 'MEDIUM') return <span className="flex items-center gap-1 text-xs text-amber-400"><ShieldAlert className="w-3 h-3" />Med</span>;
  return <span className="flex items-center gap-1 text-xs text-green-400"><ShieldCheck className="w-3 h-3" />Low</span>;
}

interface Props { products: ProductRow[]; total: number; page: number; pageSize: number; isOwner?: boolean; hasFilters?: boolean; showBlocked?: boolean; }

export function ProductsTable({ products, total, page, pageSize, isOwner = false, hasFilters = false, showBlocked = false }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const totalPages = Math.ceil(total / pageSize);

  async function deleteProduct(productId: string) {
    if (!confirm('Remove this product from the feed? This deletes the product and its lead and cannot be undone. It will disappear for all users.')) return;
    setDeletingId(productId);
    const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else setDeletingId(null);
  }

  if (!products.length) {
    if (!hasFilters) {
      return (
        <div className="card py-16 text-center">
          <ScanSearch className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-200 font-semibold text-lg mb-1">No products yet</p>
          <p className="text-sm text-slate-400 max-w-sm mx-auto mb-6">
            Run a scan to start discovering products for your pipeline.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/dashboard/scanner" className="btn-primary text-sm">
              Go to Scanner →
            </Link>
            <Link href="/contact" className="btn-secondary text-sm">
              Help &amp; Support
            </Link>
          </div>
        </div>
      );
    }
    return (
      <div className="card py-16 text-center">
        <Package className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 font-medium">No products match these filters</p>
        <p className="text-sm text-slate-500 mt-1">Try clearing search or filter options.</p>
        <Link href="/dashboard/products" className="btn-secondary text-sm mt-4 inline-flex items-center">
          Clear filters
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="flex items-center justify-end gap-2 text-xs">
          {showBlocked ? (
            <a href="?" className="text-slate-400 hover:text-slate-200 underline underline-offset-2">
              Hide blocked ASINs
            </a>
          ) : (
            <a href="?showBlocked=true" className="text-red-400 hover:text-red-300 underline underline-offset-2">
              Show blocked ASINs
            </a>
          )}
        </div>
      )}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '900px' }}>
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/40">
                {['Product', 'Retailer', 'Source Price', 'Final Cost', 'Resell', 'Profit', 'ROI', 'BSR', 'IP Risk', 'Score', ''].map((h) => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {products.map((p) => {
                const isExp = expanded === p.id;
                const { label, color } = scoreLabel(p.score);
                const amazonUrl = p.amazonUrl ?? buildAmazonUrl(p.asin);
                const discounts = (p.availableDiscounts as Discount[] | null) ?? [];
                return (
                  <React.Fragment key={p.id}>
                    {p.hasIpComplaintHistory && (
                      <tr className="bg-red-500/10 border-b border-red-500/20">
                        <td colSpan={11} className="px-4 py-1.5">
                          <div className="flex items-center gap-2 text-xs text-red-300 font-medium">
                            <ShieldAlert className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                            <span>Blocked ASIN — IP complaint history · Not deliverable to customers</span>
                            {p.ipComplaintNote && <span className="text-red-200/60">· {p.ipComplaintNote}</span>}
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr className={cn('cursor-pointer hover:bg-slate-800/40 transition-colors', p.hasIpComplaintHistory && 'opacity-50')} onClick={() => setExpanded(isExp ? null : p.id)}>
                      <td className="table-td">
                        <div className="flex items-center gap-3" style={{ minWidth: '180px' }}>
                          <div className="w-9 h-9 rounded-lg border border-slate-800 bg-slate-900 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {p.imageUrl
                              ? <img src={p.imageUrl} alt={p.title} className="w-9 h-9 object-contain" />
                              : <Package className="w-4 h-4 text-slate-600" />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-50 line-clamp-1">{p.title}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{p.asin}</div>
                          </div>
                        </div>
                      </td>
                      <td className="table-td text-xs text-slate-400">{p.sourceRetailer ?? '—'}</td>
                      <td className="table-td text-right text-xs text-slate-200">{p.sourcePrice != null ? formatCurrency(p.sourcePrice) : '—'}</td>
                      <td className="table-td text-right text-xs font-medium text-slate-50">{p.finalCost != null ? formatCurrency(p.finalCost) : '—'}</td>
                      <td className="table-td text-right text-xs text-slate-200">{p.lowestFbaPrice != null ? formatCurrency(p.lowestFbaPrice) : formatCurrency(p.price)}</td>
                      <td className="table-td text-right">
                        <span className={`text-sm font-bold ${p.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(p.profit)}</span>
                      </td>
                      <td className="table-td text-right">
                        <span className={cn('badge text-xs font-bold', p.roi >= 60 ? 'bg-green-500/15 text-green-400' : p.roi >= 30 ? 'bg-blue-500/15 text-blue-400' : 'bg-red-500/15 text-red-400')}>
                          {formatPercent(p.roi)}
                        </span>
                      </td>
                      <td className="table-td text-right text-xs text-slate-400">{p.bsr != null ? `#${p.bsr.toLocaleString()}` : '—'}</td>
                      <td className="table-td"><IpBadge score={p.ipRiskScore} /></td>
                      <td className="table-td">
                        <div className={`text-center ${color}`}>
                          <div className="text-base font-black leading-none">{p.score}</div>
                          <div className="text-[10px]">{label}</div>
                        </div>
                      </td>
                      <td className="table-td" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 items-center">
                          <a href={`/dashboard/products/${p.id}`} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-500/10 transition-all" title="View detail">
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </a>
                          <a href={amazonUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-500/10 transition-all" title="View on Amazon">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button onClick={() => setExpanded(isExp ? null : p.id)} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-all">
                            {isExp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                          {isOwner && (
                            <button
                              onClick={() => deleteProduct(p.id)}
                              disabled={deletingId === p.id}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                              title="Delete from feed"
                            >
                              {deletingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExp && (
                      <tr className="bg-slate-800/40">
                        <td colSpan={11} className="px-4 py-3">
                          <div className="grid md:grid-cols-3 gap-3 text-xs text-slate-200">
                            <div>
                              <div className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Source Details</div>
                              <div className="space-y-0.5">
                                {p.category && <div><span className="text-slate-500">Category:</span> {p.category}</div>}
                                {discounts.map((d, i) => (
                                  <div key={i} className="text-green-400">− {d.source}: −{formatCurrency(d.amount)}{d.percentage ? ` (${d.percentage}%)` : ''}</div>
                                ))}
                                {p.sourceUrl && <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1"><ExternalLink className="w-3 h-3" />{p.sourceRetailer ?? 'Source'}</a>}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Amazon Data</div>
                              <div className="space-y-0.5">
                                {p.buyBoxPrice != null && <div><span className="text-slate-500">Buy Box:</span> {formatCurrency(p.buyBoxPrice)}</div>}
                                {p.bsrPercentage != null && <div><span className="text-slate-500">BSR %:</span> Top {p.bsrPercentage.toFixed(2)}%</div>}
                                <div><span className="text-slate-500">Amazon Sells:</span> {p.amazonOwnsBuyBox ? 'Yes ⚠️' : 'No ✓'}</div>
                                <div><span className="text-slate-500">Auto-Ungated:</span> {p.autoUngated ? 'Yes ✓' : 'No'}</div>
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Fee Breakdown</div>
                              <div className="space-y-0.5">
                                {p.amazonFees != null && <div><span className="text-slate-500">Amazon Fees:</span> {formatCurrency(p.amazonFees)}</div>}
                                {p.prepFee    != null && <div><span className="text-slate-500">Prep Fee:</span> {formatCurrency(p.prepFee)}</div>}
                                {p.taxAmount  != null && <div><span className="text-slate-500">Tax:</span> {formatCurrency(p.taxAmount)}</div>}
                                <div className="font-semibold border-t border-slate-800 pt-1 mt-1">
                                  <span className="text-slate-500">Net Profit:</span> <span className={p.profit >= 0 ? 'text-green-400' : 'text-red-400'}>{formatCurrency(p.profit)}</span>
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
          <span className="text-slate-400">{total.toLocaleString()} total products</span>
          <div className="flex items-center gap-2">
            <a href={`?page=${page - 1}`} className={cn('btn-secondary text-xs py-1.5', page <= 1 && 'pointer-events-none opacity-40')}>
              <ChevronLeft className="w-3.5 h-3.5" />Prev
            </a>
            <span className="text-slate-400 px-2">Page {page} / {totalPages}</span>
            <a href={`?page=${page + 1}`} className={cn('btn-secondary text-xs py-1.5', page >= totalPages && 'pointer-events-none opacity-40')}>
              Next<ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
