'use client';

import Link from 'next/link';
import { OrderStatusBadge } from './OrderStatusBadge';
import { ShoppingCart } from 'lucide-react';

interface POItem {
  quantityOrdered:  number;
  quantityReceived: number;
  status:           string;
}

interface PurchaseOrder {
  id:           string;
  supplierName: string;
  orderDate:    string;
  totalCost:    number;
  status:       'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED' | 'CLOSED';
  items:        POItem[];
}

interface Props {
  orders:      PurchaseOrder[];
  createSlot?: React.ReactNode;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function OrderTable({ orders, createSlot }: Props) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 px-8 text-center space-y-5">
        <ShoppingCart className="w-10 h-10 text-slate-600" />

        <div className="space-y-1">
          <p className="text-slate-200 font-semibold text-base">No purchase orders yet</p>
          <p className="text-slate-500 text-xs max-w-sm mx-auto">
            Creating a purchase order records what you ordered.
            Inventory quantities are not updated until you receive the items.
          </p>
        </div>

        {/* 3-step workflow */}
        <div className="flex flex-col sm:flex-row items-center gap-2 text-xs text-slate-400 max-w-lg mx-auto">
          <div className="flex items-center gap-2 bg-slate-800/60 rounded-xl px-4 py-2.5 text-center">
            <span className="text-blue-400 font-semibold text-base leading-none">1</span>
            <span>Record what you ordered</span>
          </div>
          <span className="text-slate-700 hidden sm:block">→</span>
          <div className="flex items-center gap-2 bg-slate-800/60 rounded-xl px-4 py-2.5 text-center">
            <span className="text-amber-400 font-semibold text-base leading-none">2</span>
            <span>Receive items when they arrive</span>
          </div>
          <span className="text-slate-700 hidden sm:block">→</span>
          <div className="flex items-center gap-2 bg-slate-800/60 rounded-xl px-4 py-2.5 text-center">
            <span className="text-emerald-400 font-semibold text-base leading-none">3</span>
            <span>Inventory updates on receipt</span>
          </div>
        </div>

        {createSlot && <div>{createSlot}</div>}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth: '600px' }}>
        <thead>
          <tr className="border-b border-slate-800">
            <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">Supplier</th>
            <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">Order Date</th>
            <th className="text-right text-xs font-medium text-slate-400 px-4 py-3">Items</th>
            <th className="text-right text-xs font-medium text-slate-400 px-4 py-3">Units</th>
            <th className="text-right text-xs font-medium text-slate-400 px-4 py-3">Total Cost</th>
            <th className="text-center text-xs font-medium text-slate-400 px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((po) => {
            const nonCancelled = po.items.filter((i) => i.status !== 'CANCELLED');
            const totalUnits   = nonCancelled.reduce((s, i) => s + i.quantityOrdered, 0);
            const rcvdUnits    = nonCancelled.reduce((s, i) => s + i.quantityReceived, 0);

            return (
              <tr key={po.id} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/orders/${po.id}`} className="text-white hover:text-blue-400 font-medium">
                    {po.supplierName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-400">{fmtDate(po.orderDate)}</td>
                <td className="px-4 py-3 text-right text-slate-300">{nonCancelled.length}</td>
                <td className="px-4 py-3 text-right text-slate-300">
                  {rcvdUnits}/{totalUnits}
                </td>
                <td className="px-4 py-3 text-right text-slate-300">{fmt(po.totalCost)}</td>
                <td className="px-4 py-3 text-center">
                  <OrderStatusBadge status={po.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
