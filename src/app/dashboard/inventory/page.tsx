import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/utils';
import { DollarSign, TrendingUp, ShoppingCart, Package } from 'lucide-react';
import { AddItemModal } from '@/components/inventory/AddItemModal';
import { DeleteItemButton } from '@/components/inventory/DeleteItemButton';
import { EditItemModal } from '@/components/inventory/EditItemModal';
import { AmazonSyncButton } from '@/components/inventory/AmazonSyncButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inventory' };

const STATUS_COLORS = {
  IN_STOCK: 'bg-green-100 text-green-700',
  LISTED:   'bg-blue-100 text-blue-700',
  SOLD:     'bg-purple-100 text-purple-700',
};

export default async function InventoryPage() {
  const session = await auth();
  const orgId   = session!.user.orgId;

  const [items, stats, amazonCred] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { orgId },
      orderBy: { purchaseDate: 'desc' },
    }),
    prisma.inventoryItem.groupBy({
      by: ['status'],
      where: { orgId },
      _count: { id: true },
      _sum: { costBasis: true, estimatedProfit: true },
    }),
    prisma.amazonCredential.findUnique({
      where: { orgId },
      select: { isActive: true },
    }),
  ]);

  const amazonConnected = !!amazonCred?.isActive;

  const totalValue  = stats.reduce((s, g) => s + (g._sum.costBasis ?? 0), 0);
  const totalProfit = stats.reduce((s, g) => s + (g._sum.estimatedProfit ?? 0), 0);
  const inStock     = stats.find((g) => g.status === 'IN_STOCK')?._count.id ?? 0;
  const listed      = stats.find((g) => g.status === 'LISTED')?._count.id ?? 0;
  const sold        = stats.find((g) => g.status === 'SOLD')?._count.id ?? 0;

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">Track what you've purchased and listed</p>
        </div>
        <div className="flex items-center gap-3">
          <AmazonSyncButton connected={amazonConnected} />
          <AddItemModal />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'In Stock', value: inStock, icon: Package, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Listed', value: listed, icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Total Value', value: formatCurrency(totalValue), icon: DollarSign, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Est. Profit', value: formatCurrency(totalProfit), icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map((s) => (
          <div key={s.label} className="card p-5">
            <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div className="text-2xl font-bold text-slate-900">{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {items.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No inventory items yet</p>
            <p className="text-sm text-slate-400 mt-1">Purchase a lead to start tracking inventory</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Product', 'ASIN', 'Retailer', 'Cost Basis', 'Qty', 'Listed Price', 'Est. Profit', 'Purchase Date', 'Status', ''].map((h) => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="table-td">
                      <div className="font-medium text-slate-900 max-w-xs truncate">{item.title}</div>
                    </td>
                    <td className="table-td font-mono text-slate-500 text-xs">{item.asin}</td>
                    <td className="table-td text-slate-600">{item.retailer ?? '—'}</td>
                    <td className="table-td font-medium">{formatCurrency(item.costBasis)}</td>
                    <td className="table-td">{item.quantity}</td>
                    <td className="table-td">{item.listedPrice ? formatCurrency(item.listedPrice) : '—'}</td>
                    <td className="table-td">
                      {item.estimatedProfit != null ? (
                        <span className={item.estimatedProfit >= 0 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                          {formatCurrency(item.estimatedProfit)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="table-td text-slate-500">
                      {new Date(item.purchaseDate).toLocaleDateString()}
                    </td>
                    <td className="table-td">
                      <span className={`badge ${STATUS_COLORS[item.status]}`}>{item.status}</span>
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-0.5">
                        <EditItemModal item={item} />
                        <DeleteItemButton id={item.id} title={item.title} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
