'use client';

import { useState } from 'react';
import { Search, SlidersHorizontal, X, ChevronDown } from 'lucide-react';
import type { ProductFilters } from '@lib/types';

const CATEGORIES = [
  'Electronics', 'Home & Kitchen', 'Toys & Games', 'Sports & Outdoors',
  'Health & Beauty', 'Office Products', 'Pet Supplies', 'Arts & Crafts',
  'Books', 'Video Games', 'Clothing', 'Tools & Home Improvement',
];

const RETAILERS = [
  'Target', 'Walmart', 'Best Buy', 'Home Depot', "Kohl's",
  'Staples', 'Costco', 'Chewy', "Lowe's", "Macy's",
];

interface FiltersProps {
  filters: ProductFilters;
  onChange: (filters: ProductFilters) => void;
  totalCount: number;
}

export function Filters({ filters, onChange, totalCount }: FiltersProps) {
  const [open, setOpen] = useState(false);

  function update(key: keyof ProductFilters, value: unknown) {
    onChange({ ...filters, [key]: value || undefined, page: 1 });
  }

  function reset() {
    onChange({ page: 1, pageSize: filters.pageSize, sortBy: 'roi', sortOrder: 'desc' });
  }

  const activeCount = [
    filters.category, filters.sourceRetailer, filters.buyBoxOwner,
    filters.minRoi, filters.maxRoi, filters.minProfit, filters.ipRisk,
  ].filter(Boolean).length;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
      {/* Search bar + toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by product name, ASIN, or retailer…"
            value={filters.search ?? ''}
            onChange={(e) => update('search', e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
            open || activeCount > 0
              ? 'border-green-500 text-green-700 bg-green-50'
              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeCount > 0 && (
            <span className="bg-green-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
              {activeCount}
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {activeCount > 0 && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-500 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
        <div className="text-sm text-gray-400 ml-auto whitespace-nowrap">
          <span className="font-semibold text-gray-700">{totalCount.toLocaleString()}</span> products
        </div>
      </div>

      {/* Advanced filters */}
      {open && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 pt-2 border-t border-gray-100">
          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
            <select
              value={filters.category ?? ''}
              onChange={(e) => update('category', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          {/* Retailer */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Source Retailer</label>
            <select
              value={filters.sourceRetailer ?? ''}
              onChange={(e) => update('sourceRetailer', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All retailers</option>
              {RETAILERS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>

          {/* Buy Box Owner */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Buy Box Owner</label>
            <select
              value={filters.buyBoxOwner ?? ''}
              onChange={(e) => update('buyBoxOwner', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Any</option>
              <option value="FBA_SELLER">FBA Seller</option>
              <option value="FBM_SELLER">FBM Seller</option>
              <option value="AMAZON">Amazon</option>
              <option value="NONE">None</option>
            </select>
          </div>

          {/* Min ROI */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Min ROI %</label>
            <input
              type="number"
              min={30}
              max={500}
              placeholder="30"
              value={filters.minRoi ?? ''}
              onChange={(e) => update('minRoi', e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Min Profit */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Min Profit $</label>
            <input
              type="number"
              min={0}
              placeholder="0"
              value={filters.minProfit ?? ''}
              onChange={(e) => update('minProfit', e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Sort */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Sort By</label>
            <select
              value={`${filters.sortBy}_${filters.sortOrder}`}
              onChange={(e) => {
                const [by, order] = e.target.value.split('_');
                onChange({ ...filters, sortBy: by, sortOrder: order as 'asc' | 'desc', page: 1 });
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="roi_desc">ROI: High to Low</option>
              <option value="roi_asc">ROI: Low to High</option>
              <option value="netProfit_desc">Profit: High to Low</option>
              <option value="netProfit_asc">Profit: Low to High</option>
              <option value="bsr_asc">BSR: Best First</option>
              <option value="dateAdded_desc">Newest First</option>
              <option value="sourcePrice_asc">Price: Low to High</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
