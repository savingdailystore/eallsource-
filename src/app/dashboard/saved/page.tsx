'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Bookmark, Download, Trash2, CheckCircle2, Tag,
  FileText, Loader2, Package, Calendar, ShoppingCart,
} from 'lucide-react';
import { formatCurrency, formatPercent, truncate } from '@/lib/utils';
import type { SavedProduct } from '@/types';

export default function SavedPage() {
  const [items, setItems] = useState<SavedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editTags, setEditTags] = useState('');

  const fetchSaved = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/saved');
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.data ?? []);
    } catch {
      // leave items empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSaved(); }, [fetchSaved]);

  async function handleRemove(productId: string) {
    await fetch(`/api/saved?productId=${productId}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  async function handleMarkPurchased(item: SavedProduct) {
    try {
      const res = await fetch('/api/saved', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: item.productId, isPurchased: !item.isPurchased }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.data) setItems((prev) => prev.map((i) => i.id === item.id ? data.data : i));
    } catch { /* ignore */ }
  }

  async function handleSaveEdit(item: SavedProduct) {
    try {
      const res = await fetch('/api/saved', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: item.productId,
          notes: editNotes,
          tags: editTags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.data) setItems((prev) => prev.map((i) => i.id === item.id ? data.data : i));
    } catch { /* ignore */ }
    setEditingId(null);
  }

  function handleExport(format: 'csv' | 'excel') {
    window.open(`/api/export?format=${format}&type=saved`, '_blank');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Saved Opportunities</h1>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} products in your watchlist</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport('csv')} className="flex items-center gap-2 text-sm border border-gray-200 text-gray-600 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={() => handleExport('excel')} className="flex items-center gap-2 text-sm bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700 transition-colors font-medium">
            <Download className="w-4 h-4" /> Excel
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-20 text-center">
          <Bookmark className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No saved products yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Click the bookmark icon on any product to save it here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const p = item.product;
            const isEditing = editingId === item.id;

            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border transition-all ${
                  item.isPurchased ? 'border-green-200 bg-green-50/30' : 'border-gray-100'
                }`}
              >
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Status dot */}
                    <div className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${item.isPurchased ? 'bg-green-500' : 'bg-gray-300'}`} />

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold text-gray-900 text-sm leading-tight">{truncate(p.name, 60)}</h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-gray-400 font-mono">{p.asin}</span>
                            <span className="text-gray-200">·</span>
                            <span className="text-xs text-gray-400">{p.category}</span>
                            <span className="text-gray-200">·</span>
                            <span className="text-xs text-blue-600">{p.sourceRetailer}</span>
                            {item.isPurchased && (
                              <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                <ShoppingCart className="w-3 h-3" /> Purchased
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Metrics */}
                        <div className="flex items-center gap-6 shrink-0">
                          <Metric label="Final Cost" value={formatCurrency(p.finalCost)} />
                          <Metric label="Resell Price" value={formatCurrency(p.estimatedResellPrice)} />
                          <Metric label="Net Profit" value={formatCurrency(p.netProfit)} highlight="green" />
                          <Metric label="ROI" value={formatPercent(p.roi)} highlight="green" />
                          <Metric
                            label="BSR"
                            value={p.bsr?.toLocaleString() ?? '—'}
                            sub={p.bsrPercentage != null ? `top ${p.bsrPercentage.toFixed(2)}%` : undefined}
                          />
                        </div>
                      </div>

                      {/* Tags */}
                      {item.tags && item.tags.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <Tag className="w-3 h-3 text-gray-400" />
                          {item.tags.map((tag) => (
                            <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Notes */}
                      {item.notes && !isEditing && (
                        <div className="mt-2 flex items-start gap-1.5 text-xs text-gray-500">
                          <FileText className="w-3 h-3 mt-0.5 shrink-0 text-gray-400" />
                          <span>{item.notes}</span>
                        </div>
                      )}

                      {/* Edit form */}
                      {isEditing && (
                        <div className="mt-3 space-y-2">
                          <input
                            type="text"
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            placeholder="Notes…"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                          <input
                            type="text"
                            value={editTags}
                            onChange={(e) => setEditTags(e.target.value)}
                            placeholder="Tags (comma-separated): high-roi, q4, watchlist"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleSaveEdit(item)} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors">Save</button>
                            <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleMarkPurchased(item)}
                        title={item.isPurchased ? 'Mark as not purchased' : 'Mark as purchased'}
                        className={`p-2 rounded-xl transition-all ${
                          item.isPurchased
                            ? 'text-green-600 bg-green-100 hover:bg-green-200'
                            : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(isEditing ? null : item.id);
                          setEditNotes(item.notes ?? '');
                          setEditTags(item.tags?.join(', ') ?? '');
                        }}
                        className="p-2 rounded-xl text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRemove(item.productId)}
                        className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: 'green' }) {
  return (
    <div className="text-right">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`text-sm font-semibold ${highlight === 'green' ? 'text-green-600' : 'text-gray-900'}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}
