'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProductsTable } from '@/components/products/ProductsTable';
import type { ProductRow } from '@/components/products/ProductsTable';
import { Filters } from '@/components/dashboard/Filters';
import { Download, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { ProductFilters } from '@lib/types';

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<ProductFilters>({
    page: 1,
    pageSize: 25,
    sortBy: 'roi',
    sortOrder: 'desc',
  });

  const fetchProducts = useCallback(async (f: ProductFilters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(f).forEach(([k, v]) => {
        if (v !== undefined && v !== '') params.set(k, String(v));
      });
      const res = await fetch(`/api/products?${params}`);
      if (!res.ok) { setProducts([]); return; }
      const data = await res.json();
      setProducts(data.data ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSaved = useCallback(async () => {
    try {
      const res = await fetch('/api/saved');
      if (!res.ok) return;
      const data = await res.json();
      if (data.data) {
        setSavedIds(new Set((data.data as { productId: string }[]).map((s) => s.productId)));
      }
    } catch {
      // non-critical — saved state just won't highlight
    }
  }, []);

  useEffect(() => { fetchProducts(filters); }, [filters, fetchProducts]);
  useEffect(() => { fetchSaved(); }, [fetchSaved]);

  async function handleSave(productId: string) {
    await fetch('/api/saved', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId }) });
    setSavedIds((prev) => new Set([...prev, productId]));
  }

  async function handleUnsave(productId: string) {
    await fetch(`/api/saved?productId=${productId}`, { method: 'DELETE' });
    setSavedIds((prev) => { const n = new Set(prev); n.delete(productId); return n; });
  }

  function handleExport(format: 'csv' | 'excel') {
    window.open(`/api/export?format=${format}&type=products`, '_blank');
  }

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1800px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            All qualified opportunities — 30%+ ROI, low IP risk, top-3% BSR
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-2 text-sm border border-gray-200 text-gray-600 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={() => handleExport('excel')}
            className="flex items-center gap-2 text-sm bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700 transition-colors font-medium"
          >
            <Download className="w-4 h-4" />
            Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <Filters filters={filters} onChange={setFilters} totalCount={total} />

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
        </div>
      ) : (
        <ProductsTable
          products={products}
          savedIds={savedIds}
          onSave={handleSave}
          onUnsave={handleUnsave}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {((filters.page! - 1) * filters.pageSize!) + 1}–{Math.min(filters.page! * filters.pageSize!, total)} of {total.toLocaleString()} products
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={filters.page === 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page! - 1 }))}
              className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>
            <span className="text-sm text-gray-600 px-2">
              Page {filters.page} of {totalPages}
            </span>
            <button
              disabled={filters.page === totalPages}
              onClick={() => setFilters((f) => ({ ...f, page: f.page! + 1 }))}
              className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
