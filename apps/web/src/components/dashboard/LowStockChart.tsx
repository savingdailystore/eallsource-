'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { Warehouse, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import type { InventoryItem } from '@server/services/amazon/inventory';

interface ChartRow {
  name: string;
  asin: string;
  fulfillable: number;
  inbound: number;
  status: 'out' | 'low' | 'ok';
}

const STATUS_COLOR = { out: '#ef4444', low: '#f59e0b', ok: '#22c55e' };

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; dataKey: string; payload: ChartRow }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as ChartRow;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2.5 text-xs space-y-1 min-w-[160px]">
      <div className="font-semibold text-gray-800 truncate max-w-[180px]">{label}</div>
      <div className="text-gray-500 font-mono">{row.asin}</div>
      <div className="flex justify-between gap-4 pt-1">
        <span className="text-gray-500">Fulfillable</span>
        <span className={`font-bold ${row.status === 'out' ? 'text-red-600' : row.status === 'low' ? 'text-yellow-600' : 'text-green-600'}`}>
          {row.fulfillable}
        </span>
      </div>
      {row.inbound > 0 && (
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Inbound</span>
          <span className="font-semibold text-purple-600">{row.inbound}</span>
        </div>
      )}
      <div className={`text-xs font-medium pt-0.5 ${
        row.status === 'out' ? 'text-red-500' : row.status === 'low' ? 'text-yellow-600' : 'text-green-600'
      }`}>
        {row.status === 'out' ? 'Out of stock' : row.status === 'low' ? 'Low stock' : 'In stock'}
      </div>
    </div>
  );
};

export function LowStockChart() {
  const router = useRouter();
  const [rows, setRows] = useState<ChartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    fetch('/api/inventory')
      .then((r) => r.json())
      .then((data) => {
        const items: InventoryItem[] = data.data ?? [];
        setIsDemo(data.demo ?? true);

        // Sort by fulfillable qty ascending, show all (low/out first, rest last)
        const sorted = [...items].sort(
          (a, b) => a.inventoryDetails.fulfillableQuantity - b.inventoryDetails.fulfillableQuantity,
        );

        const alerts = sorted.filter((i) => i.inventoryDetails.fulfillableQuantity <= 3).length;
        setAlertCount(alerts);

        setRows(
          sorted.map((i) => {
            const fulfillable = i.inventoryDetails.fulfillableQuantity;
            const status: ChartRow['status'] =
              fulfillable === 0 ? 'out' : fulfillable <= 3 ? 'low' : 'ok';
            return {
              name: i.productName.length > 18 ? i.productName.slice(0, 17) + '…' : i.productName,
              asin: i.asin,
              fulfillable,
              inbound:
                i.inventoryDetails.inboundWorkingQuantity +
                i.inventoryDetails.inboundShippedQuantity +
                i.inventoryDetails.inboundReceivingQuantity,
              status,
            };
          }),
        );
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const outCount = rows.filter((r) => r.status === 'out').length;
  const lowCount = rows.filter((r) => r.status === 'low').length;

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 p-6 cursor-pointer hover:border-green-300 hover:shadow-md transition-all group"
      onClick={() => router.push('/dashboard/inventory')}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2">
          <Warehouse className="w-4 h-4 text-gray-400 group-hover:text-green-600 transition-colors" />
          <h3 className="font-semibold text-gray-900">FBA Stock Levels</h3>
        </div>
        <span className="flex items-center gap-1 text-xs text-green-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          View inventory <ArrowRight className="w-3 h-3" />
        </span>
      </div>
      <p className="text-sm text-gray-400 mb-4">Fulfillable units per SKU</p>

      {/* Alert badges */}
      {!loading && alertCount > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {outCount > 0 && (
            <span className="flex items-center gap-1 text-xs font-medium bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-full">
              <AlertTriangle className="w-3 h-3" />
              {outCount} out of stock
            </span>
          )}
          {lowCount > 0 && (
            <span className="flex items-center gap-1 text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200 px-2.5 py-1 rounded-full">
              <AlertTriangle className="w-3 h-3" />
              {lowCount} low stock
            </span>
          )}
        </div>
      )}

      {/* Chart */}
      {loading ? (
        <div className="flex items-center justify-center h-[200px]">
          <Loader2 className="w-6 h-6 animate-spin text-green-500" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[200px] text-gray-400 gap-2">
          <Warehouse className="w-8 h-8 text-gray-200" />
          <p className="text-sm">No inventory data</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={rows} barSize={20} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={-35}
              textAnchor="end"
              height={52}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f9fafb' }} />
            <Bar dataKey="fulfillable" name="Fulfillable" radius={[5, 5, 0, 0]}>
              {rows.map((row, i) => (
                <Cell key={i} fill={STATUS_COLOR[row.status]} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Legend */}
      {!loading && rows.length > 0 && (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50">
          {[
            { color: '#ef4444', label: 'Out of stock' },
            { color: '#f59e0b', label: 'Low (≤3)' },
            { color: '#22c55e', label: 'In stock' },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: l.color }} />
              <span className="text-xs text-gray-400">{l.label}</span>
            </div>
          ))}
          {isDemo && (
            <span className="ml-auto text-xs text-yellow-600 font-medium">Demo data</span>
          )}
        </div>
      )}
    </div>
  );
}
