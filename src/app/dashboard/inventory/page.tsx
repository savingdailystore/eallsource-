import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  TrendingUp, ShoppingCart, Package, Boxes,
  AlertTriangle, CheckCircle2, RefreshCcw, HelpCircle,
} from 'lucide-react';
import { AddItemModal } from '@/components/inventory/AddItemModal';
import { ImportCsvModal } from '@/components/inventory/ImportCsvModal';
import { InventoryTable } from '@/components/inventory/InventoryTable';
import { AmazonSyncButton } from '@/components/inventory/AmazonSyncButton';
import { InventoryGuide } from '@/components/inventory/InventoryGuide';
import { evaluateInventoryHealth } from '@/engines/inventoryHealth';
import type { InventoryProductSnapshot, InventoryRepricingSnapshot } from '@/engines/inventoryHealth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inventory' };

export default async function InventoryPage() {
  const session = await auth();
  const orgId   = session!.user.orgId;

  const [items, stats, amazonCred] = await Promise.all([
    prisma.inventoryItem.findMany({
      where:   { orgId },
      orderBy: { totalQuantity: 'desc' },
    }),
    prisma.inventoryItem.aggregate({
      where: { orgId },
      _sum:  { availableQuantity: true, reservedQuantity: true, inboundQuantity: true, totalQuantity: true },
    }),
    prisma.amazonCredential.findUnique({
      where:  { orgId },
      select: { isActive: true },
    }),
  ]);

  const amazonConnected = !!amazonCred?.isActive;
  const available = stats._sum.availableQuantity ?? 0;
  const reserved  = stats._sum.reservedQuantity  ?? 0;
  const inbound   = stats._sum.inboundQuantity   ?? 0;
  const total     = stats._sum.totalQuantity     ?? 0;

  // ── Phase 2: enrich each item with Product + RepricingRule intelligence ─────
  const asins = items.map((i) => i.asin);

  const [products, rules] = asins.length > 0
    ? await Promise.all([
        prisma.product.findMany({
          where:  { orgId, asin: { in: asins } },
          select: {
            asin:                  true,
            roi:                   true,
            profit:                true,
            price:                 true,
            demandLevel:           true,
            monthlySales:          true,
            fbaSellers:            true,
            totalSellers:          true,
            amazonIsSeller:        true,
            amazonOwnsBuyBox:      true,
            buyBoxSuppressed:      true,
            gatingRisk:            true,
            hasIpComplaintHistory: true,
            isBrandRestricted:     true,
            priceTrend:            true,
            priceStability:        true,
            score:                 true,
            bsr:                   true,
          },
        }),
        prisma.repricingRule.findMany({
          where:  { orgId, asin: { in: asins } },
          select: {
            asin:                 true,
            costBasis:            true,
            lastRecommendedPrice: true,
            lastDirection:        true,
            lastRepricedAt:       true,
            isActive:             true,
          },
        }),
      ])
    : [[], []];

  const productByAsin   = new Map(products.map((p) => [p.asin, p]));
  const repricingByAsin = new Map(rules.map((r) => [r.asin, r]));

  // Run health engine on the server. Date objects don't cross the client boundary;
  // only the serialisable InventoryHealthResult does.
  const enrichedItems = items.map((item) => {
    const product   = productByAsin.get(item.asin);
    const repricing = repricingByAsin.get(item.asin);

    const productSnapshot: InventoryProductSnapshot | undefined = product
      ? {
          roi:                   product.roi,
          profit:                product.profit,
          price:                 product.price,
          demandLevel:           product.demandLevel as string,
          monthlySales:          product.monthlySales,
          fbaSellers:            product.fbaSellers,
          totalSellers:          product.totalSellers,
          amazonIsSeller:        product.amazonIsSeller,
          amazonOwnsBuyBox:      product.amazonOwnsBuyBox,
          buyBoxSuppressed:      product.buyBoxSuppressed,
          gatingRisk:            product.gatingRisk as string,
          hasIpComplaintHistory: product.hasIpComplaintHistory,
          isBrandRestricted:     product.isBrandRestricted,
          priceTrend:            product.priceTrend,
          priceStability:        product.priceStability,
          score:                 product.score,
          bsr:                   product.bsr,
        }
      : undefined;

    const repricingSnapshot: InventoryRepricingSnapshot | undefined = repricing
      ? {
          costBasis:            repricing.costBasis,
          lastRecommendedPrice: repricing.lastRecommendedPrice,
          lastDirection:        repricing.lastDirection,
          lastRepricedAt:       repricing.lastRepricedAt,
          isActive:             repricing.isActive,
        }
      : undefined;

    return {
      id:                item.id,
      sku:               item.sku,
      fnsku:             item.fnsku,
      asin:              item.asin,
      productName:       item.productName,
      availableQuantity: item.availableQuantity,
      reservedQuantity:  item.reservedQuantity,
      inboundQuantity:   item.inboundQuantity,
      totalQuantity:     item.totalQuantity,
      health: evaluateInventoryHealth({
        availableQuantity: item.availableQuantity,
        reservedQuantity:  item.reservedQuantity,
        inboundQuantity:   item.inboundQuantity,
        totalQuantity:     item.totalQuantity,
        createdAt:         item.createdAt,
        product:           productSnapshot,
        repricing:         repricingSnapshot,
      }),
    };
  });

  // ── Health summary counts ──────────────────────────────────────────────────
  const statusCounts = enrichedItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.health.status] = (acc[item.health.status] ?? 0) + 1;
    return acc;
  }, {});

  const needsAttention = (statusCounts['AT_RISK']    ?? 0) + (statusCounts['LOW_MARGIN'] ?? 0);
  const reorderSoon    =  statusCounts['REORDER_SOON'] ?? 0;
  const watchCount     = (statusCounts['AGING']       ?? 0) + (statusCounts['OVERSTOCKED'] ?? 0);
  const healthyCount   =  statusCounts['HEALTHY']     ?? 0;
  const unknownCount   =  statusCounts['UNKNOWN']     ?? 0;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">Track what you&apos;ve purchased and listed</p>
        </div>
        <div className="flex items-center gap-3">
          <AmazonSyncButton connected={amazonConnected} />
          <ImportCsvModal />
          <AddItemModal />
        </div>
      </div>

      {/* Quantity stats — unchanged from Phase 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Available',   value: available, icon: Package,     color: 'text-green-400', bg: 'bg-green-500/10' },
          { label: 'Reserved',    value: reserved,  icon: ShoppingCart, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'Inbound',     value: inbound,   icon: TrendingUp,  color: 'text-blue-600',  bg: 'bg-blue-500/10'  },
          { label: 'Total Units', value: total,     icon: Boxes,       color: 'text-slate-300', bg: 'bg-slate-800'    },
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

      {/* Phase 2: Inventory Health summary — only shown when items exist */}
      {items.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Inventory Health
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'Needs Attention',
                value: needsAttention,
                icon:  AlertTriangle,
                color: needsAttention > 0 ? 'text-red-400'    : 'text-slate-600',
                bg:    needsAttention > 0 ? 'bg-red-500/10'   : 'bg-slate-800',
              },
              {
                label: 'Reorder Soon',
                value: reorderSoon,
                icon:  RefreshCcw,
                color: reorderSoon > 0 ? 'text-amber-400'   : 'text-slate-600',
                bg:    reorderSoon > 0 ? 'bg-amber-500/10'  : 'bg-slate-800',
              },
              {
                label: 'Watch',
                value: watchCount,
                icon:  Package,
                color: watchCount > 0 ? 'text-orange-400'  : 'text-slate-600',
                bg:    watchCount > 0 ? 'bg-orange-500/10' : 'bg-slate-800',
              },
              {
                label: 'Healthy',
                value: healthyCount,
                icon:  CheckCircle2,
                color: healthyCount > 0 ? 'text-green-400'   : 'text-slate-600',
                bg:    healthyCount > 0 ? 'bg-green-500/10'  : 'bg-slate-800',
              },
            ].map((s) => (
              <div key={s.label} className="card p-5">
                <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {unknownCount > 0 && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
              <HelpCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {unknownCount} item{unknownCount !== 1 ? 's' : ''} {unknownCount !== 1 ? 'have' : 'has'} no scan data — health cannot be assessed.
              Run a scanner search for those ASINs to unlock insights.
            </div>
          )}
        </div>
      )}

      {/* Beginner walkthrough */}
      <InventoryGuide />

      {/* Table */}
      <div className="card overflow-hidden">
        {items.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">No inventory items yet</p>
            <p className="text-sm text-slate-500 mt-1">Purchase a lead to start tracking inventory</p>
          </div>
        ) : (
          <InventoryTable items={enrichedItems} />
        )}
      </div>
    </div>
  );
}
