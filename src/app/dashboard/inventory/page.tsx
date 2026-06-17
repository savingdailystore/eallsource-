import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { TrendingUp, ShoppingCart, Package, Boxes } from 'lucide-react';
import { AddItemModal } from '@/components/inventory/AddItemModal';
import { ImportCsvModal } from '@/components/inventory/ImportCsvModal';
import { InventoryTable } from '@/components/inventory/InventoryTable';
import { AmazonSyncButton } from '@/components/inventory/AmazonSyncButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inventory' };

export default async function InventoryPage() {
  const session = await auth();
  const orgId   = session!.user.orgId;

  const [items, stats, amazonCred] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { orgId },
      orderBy: { totalQuantity: 'desc' },
    }),
    prisma.inventoryItem.aggregate({
      where: { orgId },
      _sum: { availableQuantity: true, reservedQuantity: true, inboundQuantity: true, totalQuantity: true },
    }),
    prisma.amazonCredential.findUnique({
      where: { orgId },
      select: { isActive: true },
    }),
  ]);

  const amazonConnected = !!amazonCred?.isActive;
  const available = stats._sum.availableQuantity ?? 0;
  const reserved  = stats._sum.reservedQuantity ?? 0;
  const inbound   = stats._sum.inboundQuantity ?? 0;
  const total     = stats._sum.totalQuantity ?? 0;

  return (
    <div className="p-6 lg:p-8 space-y-6">
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
          { label: 'Available', value: available, icon: Package, color: 'text-green-400', bg: 'bg-green-500/10' },
          { label: 'Reserved', value: reserved, icon: ShoppingCart, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'Inbound', value: inbound, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-500/10' },
          { label: 'Total Units', value: total, icon: Boxes, color: 'text-slate-300', bg: 'bg-slate-800' },
        ].map((s) => (
          <div key={s.label} className="card p-5">
            <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div className="text-2xl font-bold text-slate-50">{s.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {items.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">No inventory items yet</p>
            <p className="text-sm text-slate-500 mt-1">Purchase a lead to start tracking inventory</p>
          </div>
        ) : (
          <InventoryTable items={items} />
        )}
      </div>
    </div>
  );
}
