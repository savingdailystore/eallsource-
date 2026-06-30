'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { EditItemModal } from './EditItemModal';
import { DeleteItemButton } from './DeleteItemButton';
import { InventoryHealthBadge } from './InventoryHealthBadge';
import { InventoryIntelPanel } from './InventoryIntelPanel';
import type { InventoryHealthResult } from '@/engines/inventoryHealth';

export interface InventoryRow {
  id:                string;
  sku:               string | null;
  fnsku:             string | null;
  asin:              string;
  productName:       string;
  availableQuantity: number;
  reservedQuantity:  number;
  inboundQuantity:   number;
  totalQuantity:     number;
  purchasedAt?:      string | null; // ISO string serialised from Date server-side
  unitCost?:         number | null;
  health?:           InventoryHealthResult;
}

const COL_COUNT = 11; // checkbox + SKU + FNSKU + ASIN + Product Name + Health + Available + Reserved + Inbound + Total + Actions

export function InventoryTable({ items }: { items: InventoryRow[] }) {
  const router = useRouter();
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [deleting,  setDeleting]  = useState(false);
  const headerRef = useRef<HTMLInputElement>(null);

  const allSelected  = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0 && !allSelected;

  useEffect(() => {
    if (headerRef.current) headerRef.current.indeterminate = someSelected;
  }, [someSelected]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    setDeleting(true);
    await fetch('/api/inventory/bulk-delete', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ids: [...selected] }),
    });
    setDeleting(false);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div>
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-5 py-2.5 bg-blue-500/10 border-b border-blue-500/30">
          <span className="text-sm font-medium text-slate-200">{selected.size} selected</span>
          <button
            onClick={deleteSelected}
            disabled={deleting}
            className="flex items-center gap-1.5 text-xs text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded-lg font-medium transition-colors"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Delete selected
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 ml-auto"
          >
            <X className="w-3.5 h-3.5" />Clear
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-800/40">
              <th className="table-th w-10">
                <input
                  ref={headerRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded border-slate-700 text-blue-500 focus:ring-blue-400 cursor-pointer"
                />
              </th>
              {['SKU', 'FNSKU', 'ASIN', 'Product Name', 'Health', 'Available', 'Reserved', 'Inbound', 'Total', ''].map((h) => (
                <th key={h} className="table-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {items.map((item) => {
              const isSel    = selected.has(item.id);
              const isExpanded = expanded === item.id;

              return (
                <>
                  <tr
                    key={item.id}
                    className={`transition-colors ${isSel ? 'bg-blue-500/10' : 'hover:bg-slate-800/40'}`}
                  >
                    <td className="table-td">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleOne(item.id)}
                        className="w-4 h-4 rounded border-slate-700 text-blue-500 focus:ring-blue-400 cursor-pointer"
                      />
                    </td>
                    <td className="table-td font-mono text-slate-300 text-xs">{item.sku ?? '—'}</td>
                    <td className="table-td font-mono text-slate-400 text-xs">{item.fnsku ?? '—'}</td>
                    <td className="table-td font-mono text-slate-400 text-xs">{item.asin}</td>
                    <td className="table-td">
                      <div className="font-medium text-slate-50 max-w-[200px] truncate">
                        {item.productName}
                      </div>
                    </td>
                    <td className="table-td">
                      {item.health ? (
                        <InventoryHealthBadge status={item.health.status} />
                      ) : (
                        <span className="text-slate-700 text-xs">—</span>
                      )}
                    </td>
                    <td className="table-td font-medium text-slate-50">{item.availableQuantity}</td>
                    <td className="table-td text-slate-300">{item.reservedQuantity}</td>
                    <td className="table-td text-slate-300">{item.inboundQuantity}</td>
                    <td className="table-td font-semibold text-slate-50">{item.totalQuantity}</td>
                    <td className="table-td">
                      <div className="flex items-center gap-0.5">
                        <EditItemModal item={item} />
                        <DeleteItemButton id={item.id} title={item.productName} />
                        {item.health && (
                          <button
                            onClick={() => setExpanded(isExpanded ? null : item.id)}
                            aria-label={isExpanded ? 'Collapse intelligence' : 'Expand intelligence'}
                            className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
                          >
                            {isExpanded
                              ? <ChevronUp className="w-3.5 h-3.5" />
                              : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {isExpanded && item.health && (
                    <tr key={`${item.id}-intel`}>
                      <td colSpan={COL_COUNT} className="p-0">
                        <InventoryIntelPanel health={item.health} />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
