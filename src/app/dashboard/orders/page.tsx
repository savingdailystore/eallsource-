import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { ShoppingCart, Package, PackageCheck, Clock, DollarSign } from 'lucide-react';
import { OrderTable } from '@/components/orders/OrderTable';
import { CreateOrderModal } from '@/components/orders/CreateOrderModal';
import { buildPODashboardSummary } from '@/engines/purchaseOrder';
import { PageGuide } from '@/components/ui/PageGuide';
import type { POSummaryInput } from '@/engines/purchaseOrder';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Orders' };

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export default async function OrdersPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { orgId, role } = session.user;

  const orders = await prisma.purchaseOrder.findMany({
    where:   { orgId },
    orderBy: { orderDate: 'desc' },
    include: {
      items: {
        select: {
          quantityOrdered:  true,
          quantityReceived: true,
          totalCost:        true,
          status:           true,
        },
      },
    },
  });

  const summaryInput: POSummaryInput[] = orders.map((po) => ({
    status:    po.status,
    totalCost: po.totalCost,
    items:     po.items.map((i) => ({
      quantityOrdered:  i.quantityOrdered,
      quantityReceived: i.quantityReceived,
      status:           i.status,
    })),
  }));

  const summary = buildPODashboardSummary(summaryInput);

  const canCreate = role !== 'VIEWER';

  const tableOrders = orders.map((po) => ({
    id:           po.id,
    supplierName: po.supplierName,
    orderDate:    po.orderDate.toISOString(),
    totalCost:    po.totalCost,
    status:       po.status,
    items:        po.items.map((i) => ({
      quantityOrdered:  i.quantityOrdered,
      quantityReceived: i.quantityReceived,
      status:           i.status,
    })),
  }));

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchase Orders</h1>
          <p className="page-subtitle">Track what you bought, when it arrived, and what it cost.</p>
        </div>
        {canCreate && <CreateOrderModal />}
      </div>

      {/* Beginner guide */}
      <PageGuide
        storageKey="orders-guide-collapsed"
        title="How purchase orders work"
        subtitle="Receiving inventory updates your available counts and unit cost."
        steps={[
          { title: '1. Record what you ordered', body: 'Create an order with the supplier name, date, and items. This records what you bought — it does not update inventory yet.' },
          { title: '2. Receive items when they arrive', body: 'Mark units as received only after they are physically available or confirmed at the warehouse. This is what updates inventory.' },
          { title: '3. Inventory updates after receipt', body: 'Once you mark items received, available counts and unit cost update automatically on the Inventory page.' },
        ]}
        columns={3}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-dark rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-slate-400">Open Orders</span>
          </div>
          <div className="text-2xl font-bold text-white">{summary.openOrders}</div>
          {summary.draftOrders > 0 && (
            <div className="text-xs text-slate-500 mt-0.5">{summary.draftOrders} draft</div>
          )}
        </div>

        <div className="card-dark rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-slate-400">Partial</span>
          </div>
          <div className="text-2xl font-bold text-white">{summary.partiallyReceived}</div>
        </div>

        <div className="card-dark rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <PackageCheck className="w-4 h-4 text-green-400" />
            <span className="text-xs text-slate-400">Received</span>
          </div>
          <div className="text-2xl font-bold text-white">{summary.fullyReceived}</div>
        </div>

        <div className="card-dark rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-slate-400">Total Ordered</span>
          </div>
          <div className="text-2xl font-bold text-white">{fmt(summary.totalOrderedCost)}</div>
          {summary.totalPendingUnits > 0 && (
            <div className="text-xs text-slate-500 mt-0.5">{summary.totalPendingUnits} units pending</div>
          )}
        </div>
      </div>

      {/* Orders table */}
      <div className="card-dark rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-300">All Orders</span>
          <span className="ml-auto text-xs text-slate-500">{summary.totalOrders} total</span>
        </div>
        <OrderTable
          orders={tableOrders}
          createSlot={canCreate ? <CreateOrderModal triggerLabel="Create your first purchase order" /> : undefined}
        />
      </div>
    </div>
  );
}
