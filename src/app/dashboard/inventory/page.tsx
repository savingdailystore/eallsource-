import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/utils';
import { DollarSign, TrendingUp, ShoppingCart, Package } from 'lucide-react';
import { AddItemModal } from '@/components/inventory/AddItemModal';
import { AmazonSyncButton } from '@/components/inventory/AmazonSyncButton';
import { ImportCsvModal } from '@/components/inventory/ImportCsvModal';
import { InventoryTable } from '@/components/inventory/InventoryTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inventory' };

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
          <ImportCsvModal />
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
          <InventoryTable items={items} />
        )}
      </div>
    </div>
  );
}
