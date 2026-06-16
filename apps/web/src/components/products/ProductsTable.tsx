'use client';

import React, { useState } from 'react';
import { ExternalLink, Bookmark, BookmarkCheck, Package, MoreHorizontal } from 'lucide-react';
import { formatCurrency, formatPercent } from '@lib/utils';

export interface ProductRow {
  id: string;
  asin: string;
  title: string;
  price: number;
  fees: number;
  profit: number;
  roi: number;
  score: number;
  createdAt: string;
}

interface ProductsTableProps {
  products: ProductRow[];
  savedIds?: Set<string>;
  onSave?: (productId: string) => void;
  onUnsave?: (productId: string) => void;
}

function RoiBadge({ roi }: { roi: number }) {
  const cls =
    roi >= 60 ? 'bg-green-100 text-green-700' :
    roi >= 40 ? 'bg-blue-100 text-blue-700' :
    'bg-yellow-100 text-yellow-700';
  return (
    <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>
      {formatPercent(roi)}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 80 ? 'bg-green-100 text-green-700' :
    score >= 60 ? 'bg-blue-100 text-blue-700' :
    score >= 40 ? 'bg-amber-100 text-amber-700' :
    'bg-gray-100 text-gray-500';
  const tier = score >= 80 ? 'HOT' : score >= 60 ? 'GOOD' : score >= 40 ? 'MAR' : 'SKIP';
  return (
    <div className={`inline-flex flex-col items-center px-2 py-0.5 rounded-lg text-xs font-bold ${cls}`}>
      <span>{score}</span>
      <span className="text-[9px] opacity-70">{tier}</span>
    </div>
  );
}

function ProductImage({ asin, title }: { asin: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="w-10 h-10 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center flex-shrink-0">
        <Package className="w-4 h-4 text-gray-300" />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
      <img
        src={`https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SL75_.jpg`}
        alt={title}
        className="w-10 h-10 object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              {['Product', 'Amazon Price', 'Fees', 'Net Profit', 'ROI', 'Score', ''].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {products.map((p) => {
              const isSaved = savedIds.has(p.id);
              const isExpanded = expandedId === p.id;
              const sourceCost = Math.max(0, p.price - p.fees - p.profit);
              return (
                <React.Fragment key={p.id}>
                  <tr
                    className="cursor-pointer hover:bg-gray-50/60 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ProductImage asin={p.asin} title={p.title} />
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 text-sm leading-tight line-clamp-1">{p.title}</div>
                          <div className="text-xs text-gray-400 font-mono mt-0.5">{p.asin}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{formatCurrency(p.price)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatCurrency(p.fees)}</td>
                    <td className="px-4 py-3">
                      <div className={`font-bold ${p.profit >= 10 ? 'text-green-600' : p.profit >= 5 ? 'text-blue-600' : 'text-gray-700'}`}>
                        {formatCurrency(p.profit)}
                      </div>
                    </td>
                    <td className="px-4 py-3"><RoiBadge roi={p.roi} /></td>
                    <td className="px-4 py-3"><ScoreBadge score={p.score} /></td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => isSaved ? onUnsave?.(p.id) : onSave?.(p.id)}
                          className={`p-1.5 rounded-lg transition-all ${isSaved ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}
                          title={isSaved ? 'Remove from saved' : 'Save for later'}
                        >
                          {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                        </button>
                        <a
                          href={`https://www.amazon.com/dp/${p.asin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
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

                  {isExpanded && (
                    <tr className="bg-green-50/30">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-xs text-gray-400 font-medium mb-0.5">Est. Source Cost</div>
                            <div className="text-gray-700 font-medium">{formatCurrency(sourceCost)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-400 font-medium mb-0.5">Amazon Fees</div>
                            <div className="text-gray-700 font-medium">{formatCurrency(p.fees)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-400 font-medium mb-0.5">Resell Price</div>
                            <div className="text-gray-700 font-medium">{formatCurrency(p.price)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-400 font-medium mb-0.5">Net Profit</div>
                            <div className="font-bold text-green-600">{formatCurrency(p.profit)}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-green-100">
                          <a
                            href={`https://www.amazon.com/dp/${p.asin}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-orange-600 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" />Amazon
                          </a>
                          <a
                            href={`https://keepa.com/#!product/1-${p.asin}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-purple-600 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" />Keepa History
                          </a>
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
