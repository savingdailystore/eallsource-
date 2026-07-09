import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Package, DollarSign, Calendar,
  ExternalLink, PackageCheck, Truck, XCircle,
} from 'lucide-react';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { ReceiveItemsModal } from '@/components/orders/ReceiveItemsModal';
import { CancelOrderButton } from '@/components/orders/CancelOrderButton';
import { CloseOrderButton } from '@/components/orders/CloseOrderButton';

export const dynamic = 'force-dynamic';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const ITEM_STATUS_COLORS: Record<string, string> = {
  ORDERED:            'text-blue-400',
  PARTIALLY_RECEIVED: 'text-amber-400',
  RECEIVED:           'text-green-400',
  CANCELLED:          'text-slate-500',
};

function itemStatusLabel(status: string) {
  if (status === 'PARTIALLY_RECEIVED') return 'Partial';
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { orgId, role } = session.user;
  const { id } = await params;

  const po = await prisma.purchaseOrder.findFirst({
    where:   { id, orgId },
    include: { items: { orderBy: { createdAt: 'asc' } } },
  });

  if (!po) notFound();

  // Determine which ASINs have inventory records (for quick-nav links)
  const itemAsins = po.items.map((i) => i.asin).filter(Boolean) as string[];
  const inventoryAsins = new Set(
    itemAsins.length > 0
      ? (await prisma.inventoryItem.findMany({
          where:  { orgId, asin: { in: itemAsins } },
          select: { asin: true },
        })).map((i) => i.asin)
      : [],
  );

  const canReceive = role !== 'VIEWER' && po.status !== 'CANCELLED' && po.status !== 'RECEIVED' && po.status !== 'CLOSED';
  const canCancel  = (role === 'OWNER' || role === 'ADMIN') && po.status !== 'CANCELLED' && po.status !== 'RECEIVED' && po.status !== 'CLOSED';
  const canClose   = role !== 'VIEWER' && (po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED');

  const receiveableItems = po.items.map((i) => ({
    id:               i.id,
    productName:      i.productName,
    asin:             i.asin,
    quantityOrdered:  i.quantityOrdered,
    quantityReceived: i.quantityReceived,
    status:           i.status,
  }));

  const nonCancelledItems = po.items.filter((i) => i.status !== 'CANCELLED');

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-4xl">
      {/* Back */}
      <Link href="/dashboard/orders" className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm w-fit">
        <ArrowLeft className="w-4 h-4" /> Purchase Orders
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">{po.supplierName}</h1>
            <OrderStatusBadge status={po.status} />
          </div>
          {po.supplierOrderId && (
            <p className="text-slate-400 text-sm">Ref: {po.supplierOrderId}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          {canReceive && <ReceiveItemsModal poId={po.id} items={receiveableItems} />}
          {canCancel  && <CancelOrderButton poId={po.id} />}
          {canClose   && <CloseOrderButton  poId={po.id} />}
        </div>
      </div>

      {/* Meta cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-dark rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-400">Order Date</span>
          </div>
          <div className="text-sm font-medium text-white">{fmtDate(po.orderDate)}</div>
        </div>

        {po.expectedDate && (
          <div className="card-dark rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Truck className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs text-slate-400">Expected</span>
            </div>
            <div className="text-sm font-medium text-white">{fmtDate(po.expectedDate)}</div>
          </div>
        )}

        <div className="card-dark rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-400">Total Cost</span>
          </div>
          <div className="text-sm font-medium text-white">{fmt(po.totalCost)}</div>
          {(po.shippingCost > 0 || po.tax > 0) && (
            <div className="text-xs text-slate-500 mt-0.5">
              +{fmt(po.shippingCost)} ship · +{fmt(po.tax)} tax
            </div>
          )}
        </div>

        <div className="card-dark rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Package className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-400">Items</span>
          </div>
          <div className="text-sm font-medium text-white">{nonCancelledItems.length}</div>
        </div>
      </div>

      {/* Status legend */}
      <div className="rounded-xl border border-slate-800 bg-slate-800/30 px-4 py-3 text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-400 mb-1.5">Order status guide</p>
        <p><span className="text-blue-400 font-medium">Ordered</span> — Items ordered, not yet received.</p>
        <p><span className="text-amber-400 font-medium">Partially Received</span> — Some items arrived. Receive the remainder to close this order.</p>
        <p><span className="text-green-400 font-medium">Received</span> — All items received and inventory has been updated.</p>
        <p><span className="text-slate-400 font-medium">Cancelled</span> — Order cancelled. Inventory was not affected by cancellation.</p>
        <p><span className="text-slate-400 font-medium">Closed</span> — Order complete without updating inventory. Use this when items were consumed or handled outside app tracking.</p>
      </div>

      {/* Closed state detail */}
      {po.status === 'CLOSED' && (
        <div className="flex items-start gap-2.5 rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm text-slate-400">
          <XCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-medium text-slate-300">Closed without updating inventory</p>
            {po.closedAt && (
              <p className="text-xs text-slate-500">Closed on {fmtDate(po.closedAt)}</p>
            )}
            {po.closeReason && (
              <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{po.closeReason}</p>
            )}
          </div>
        </div>
      )}

      {po.notes && (
        <div className="card-dark rounded-xl p-4 text-sm text-slate-400 whitespace-pre-wrap">{po.notes}</div>
      )}

      {/* Line items */}
      <div className="card-dark rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center gap-2">
          <PackageCheck className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-300">Line Items</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left   text-xs font-medium text-slate-400 px-4 py-3">Product</th>
                <th className="text-left   text-xs font-medium text-slate-400 px-4 py-3">ASIN</th>
                <th className="text-right  text-xs font-medium text-slate-400 px-4 py-3">Qty</th>
                <th className="text-right  text-xs font-medium text-slate-400 px-4 py-3">Rcv&apos;d</th>
                <th className="text-right  text-xs font-medium text-slate-400 px-4 py-3">Unit Cost</th>
                <th className="text-right  text-xs font-medium text-slate-400 px-4 py-3">Total</th>
                <th className="text-center text-xs font-medium text-slate-400 px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((item) => (
                <tr key={item.id} className="border-b border-slate-800/60">
                  <td className="px-4 py-3">
                    <div className="text-white font-medium">{item.productName}</div>
                    {item.sourceUrl && (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:underline flex items-center gap-0.5 mt-0.5"
                      >
                        <ExternalLink className="w-3 h-3" /> Source
                      </a>
                    )}
                    {item.leadId && (
                      <Link
                        href={`/dashboard/leads/${item.leadId}`}
                        className="text-xs text-violet-400 hover:underline flex items-center gap-0.5 mt-0.5"
                      >
                        ← Lead
                      </Link>
                    )}
                    {item.notes && <div className="text-xs text-slate-500 mt-0.5">{item.notes}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <div className="text-slate-400">{item.asin ?? '—'}</div>
                    {item.asin && inventoryAsins.has(item.asin) && (
                      <Link
                        href="/dashboard/inventory"
                        className="text-xs text-emerald-400 hover:underline flex items-center gap-0.5 mt-0.5"
                      >
                        → Inventory
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300">{item.quantityOrdered}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{item.quantityReceived}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{fmt(item.unitCost)}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{fmt(item.totalCost)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium ${ITEM_STATUS_COLORS[item.status] ?? 'text-slate-400'}`}>
                      {itemStatusLabel(item.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-700">
                <td colSpan={5} className="px-4 py-3 text-right text-xs text-slate-400">Order Total</td>
                <td className="px-4 py-3 text-right text-white font-semibold">{fmt(po.totalCost)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
