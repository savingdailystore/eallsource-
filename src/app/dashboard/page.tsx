import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { leadAccessWhere } from '@/lib/lead-access';
import { formatCurrency, relativeTime } from '@/lib/utils';
import { scoreLabel } from '@/engines/scoring';
import { analyseReimbursement } from '@/engines/reimbursementRecovery';
import { summarizeSales } from '@/engines/salesTracking';
import {
  summarizeLeads,
  summarizeWorkflowFunnel,
  summarizeInventory,
  summarizePurchaseOrders,
  summarizeRepricing,
  summarizeRecovery,
  buildActionItems,
} from '@/engines/businessIntelligence';
import { RoiGauge } from '@/components/dashboard/RoiGauge';
import { WeeklyLeadsChart } from '@/components/dashboard/WeeklyLeadsChart';
import { WorkflowFunnel } from '@/components/bi/WorkflowFunnel';
import { ActionCenter } from '@/components/bi/ActionCenter';
import Link from 'next/link';
import {
  TrendingUp, Package, Wallet, RefreshCw, ShieldCheck,
  ShoppingCart, ArrowUpRight, Flame, CheckCircle2, Clock,
  AlertTriangle, BarChart3, DollarSign,
} from 'lucide-react';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const session = await auth();
  const orgId   = session!.user.orgId;
  const role    = session!.user.role;
  const plan    = session!.user.plan;
  const isOwner = role === 'OWNER';
  const isPro   = plan === 'PRO' || plan === 'ENTERPRISE';

  const currentOrg = await prisma.organization.findUnique({
    where:  { id: orgId },
    select: { isBroadcastSource: true },
  });
  const isBroadcastSource = currentOrg?.isBroadcastSource ?? false;

  // ── Parallel data fetch ────────────────────────────────────────────────────
  const [
    leadsRaw,
    weeklyLeads,
    leadStats,
    topLeads,
    recentJobs,
    inventoryRaw,
    repricingRulesRaw,
    repricingHistoryRaw,
    purchaseOrdersRaw,
    reimbursementsRaw,
    lastSync,
    recoveryProducts,
    salesRawBI,
    lastSalesSync,
    settlementUnmatchedCount,
    refundRowsStored,
    unsupportedSettlementRowsStored,
    amazonCred,
  ] = await Promise.all([
    // All non-expired entitled leads for funnel + summarize
    prisma.lead.findMany({
      where:   { ...leadAccessWhere({ orgId, isBroadcastSource }), status: { not: 'EXPIRED' } },
      select:  { status: true, createdAt: true },
    }),

    // Weekly chart
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT DATE_TRUNC('day', "createdAt") as day, COUNT(*) as count
      FROM leads
      WHERE "orgId" = ${orgId}
        AND "createdAt" >= NOW() - INTERVAL '7 days'
      GROUP BY day
      ORDER BY day
    `,

    // Avg ROI / score for gauge
    prisma.$queryRaw<{ avg_roi: number; avg_score: number }[]>`
      SELECT AVG(p.roi)::float as avg_roi, AVG(l.score)::float as avg_score
      FROM leads l
      JOIN products p ON p.id = l."productId"
      WHERE l."orgId" = ${orgId}
        AND l.status NOT IN ('REJECTED', 'EXPIRED')
    `,

    // Top entitled leads by score
    prisma.lead.findMany({
      where:   { ...leadAccessWhere({ orgId, isBroadcastSource }), status: { in: ['NEW', 'SAVED'] } },
      orderBy: { score: 'desc' },
      take:    5,
      include: {
        product: {
          select: { title: true, asin: true, roi: true, profit: true, score: true, sourceRetailer: true },
        },
      },
    }),

    // Recent scan jobs — owner only
    isOwner
      ? prisma.scanJob.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, take: 5 })
      : Promise.resolve([] as Awaited<ReturnType<typeof prisma.scanJob.findMany>>),

    // Inventory items with linked product and repricing for health evaluation
    prisma.inventoryItem.findMany({
      where:  { orgId },
      select: {
        availableQuantity: true,
        reservedQuantity:  true,
        inboundQuantity:   true,
        totalQuantity:     true,
        createdAt:         true,
        purchasedAt:       true,
        unitCost:          true,
        asin:              true,
      },
    }),

    // Repricing rules
    prisma.repricingRule.findMany({
      where:  { orgId },
      select: { isActive: true, costBasis: true, lastRepricedAt: true },
    }),

    // Repricing history for proposal/push counts
    prisma.repricingHistory.findMany({
      where:  { ruleId: { in: await prisma.repricingRule.findMany({ where: { orgId }, select: { id: true } }).then((r) => r.map((x) => x.id)) } },
      select: { status: true, pushedAt: true },
    }),

    // Purchase orders with items
    prisma.purchaseOrder.findMany({
      where:   { orgId },
      select:  {
        status:    true,
        totalCost: true,
        items: {
          select: {
            quantityOrdered:  true,
            quantityReceived: true,
            status:           true,
          },
        },
      },
    }),

    // Reimbursements for recovery summary (PRO only)
    isPro
      ? prisma.reimbursement.findMany({
          where:   { orgId },
          select:  { reimbursementId: true, approvalDate: true, caseId: true, amazonOrderId: true, reason: true, sku: true, fnsku: true, asin: true, productName: true, condition: true, currencyUnit: true, amountPerUnit: true, amountTotal: true, quantityReimbursedCash: true, quantityReimbursedInventory: true, quantityReimbursedTotal: true, originalReimbursementId: true, originalReimbursementType: true, rawPayload: true },
        })
      : Promise.resolve([] as any[]),

    // Last reimbursement sync
    isPro
      ? prisma.reimbursementSync.findFirst({ where: { orgId }, orderBy: { startedAt: 'desc' }, select: { status: true, startedAt: true, completedAt: true, source: true } })
      : Promise.resolve(null),

    // Cost data for reimbursement analysis
    isPro
      ? (async () => {
          const reimbAsins = await prisma.reimbursement.findMany({ where: { orgId }, select: { asin: true } });
          const asins = [...new Set(reimbAsins.map((r) => r.asin).filter(Boolean))] as string[];
          if (asins.length === 0) return { inventory: [], repricing: [], products: [] };
          const [inv, rep, prod] = await Promise.all([
            prisma.inventoryItem.findMany({ where: { orgId, asin: { in: asins } }, select: { asin: true, sku: true, unitCost: true } }),
            prisma.repricingRule.findMany({ where: { orgId, asin: { in: asins } }, select: { asin: true, costBasis: true } }),
            prisma.product.findMany({ where: { orgId, asin: { in: asins } }, select: { asin: true, sourcePrice: true, totalLandedCost: true } }),
          ]);
          return { inventory: inv, repricing: rep, products: prod };
        })()
      : Promise.resolve({ inventory: [], repricing: [], products: [] }),

    // Sales records for BI summary (PRO only — limited to recent 500 for perf)
    isPro
      ? prisma.saleRecord.findMany({
          where:   { orgId },
          orderBy: { saleDate: 'desc' },
          take:    500,
          select: {
            saleDate: true, quantitySold: true, grossRevenue: true, netRevenue: true,
            totalFees: true, cogs: true, grossProfitBeforeFees: true,
            realizedProfit: true, roi: true, asin: true, sku: true,
            unitCostUsed: true, costSource: true,
          },
        })
      : Promise.resolve([] as any[]),

    // Last sales sync
    isPro
      ? prisma.salesSync.findFirst({
          where:   { orgId },
          orderBy: { startedAt: 'desc' },
          select:  { status: true, startedAt: true, source: true },
        })
      : Promise.resolve(null),

    // Settlement unmatched count (PRO only)
    isPro
      ? prisma.settlementRecord.count({
          where: { orgId, transactionType: 'Order', matchedSaleRecordId: null },
        })
      : Promise.resolve(0),

    // Refund rows stored — not applied to profit (PRO only)
    isPro
      ? prisma.settlementRecord.count({
          where: { orgId, transactionType: 'Refund' },
        })
      : Promise.resolve(0),

    // Unsupported/adjustment rows stored — not applied to profit (PRO only)
    isPro
      ? prisma.settlementRecord.count({
          where: { orgId, transactionType: { not: { in: ['Order', 'Refund'] } } },
        })
      : Promise.resolve(0),

    // Amazon SP-API connection status — for Getting Started checklist
    prisma.amazonCredential.findUnique({
      where:  { orgId },
      select: { isActive: true },
    }),
  ]);

  // ── Product data for inventory health ─────────────────────────────────────
  const invAsins   = inventoryRaw.map((i) => i.asin);
  const [invProducts, invRepricing] = await Promise.all([
    invAsins.length > 0
      ? prisma.product.findMany({
          where:  { orgId, asin: { in: invAsins } },
          select: { asin: true, roi: true, profit: true, price: true, demandLevel: true, monthlySales: true, fbaSellers: true, totalSellers: true, amazonIsSeller: true, amazonOwnsBuyBox: true, buyBoxSuppressed: true, gatingRisk: true, hasIpComplaintHistory: true, isBrandRestricted: true, priceTrend: true, priceStability: true, score: true, bsr: true },
        })
      : Promise.resolve([] as any[]),
    invAsins.length > 0
      ? prisma.repricingRule.findMany({
          where:  { orgId, asin: { in: invAsins } },
          select: { asin: true, costBasis: true, lastRecommendedPrice: true, lastDirection: true, lastRepricedAt: true, isActive: true },
        })
      : Promise.resolve([] as any[]),
  ]);

  // ── Build lookup maps ──────────────────────────────────────────────────────
  const productByAsin   = new Map(invProducts.map((p: any)  => [p.asin, p]));
  const repricingByAsin = new Map(invRepricing.map((r: any) => [r.asin, r]));

  const inventoryForBI = inventoryRaw.map((item) => ({
    ...item,
    product:   productByAsin.get(item.asin) ?? null,
    repricing: repricingByAsin.get(item.asin) ?? null,
  }));

  // ── Run BI engines ─────────────────────────────────────────────────────────
  const leadSummary      = summarizeLeads(leadsRaw);
  const poSummary        = summarizePurchaseOrders(purchaseOrdersRaw);
  const invSummary       = summarizeInventory(inventoryForBI);
  const repricingSummary = summarizeRepricing(repricingRulesRaw, repricingHistoryRaw);
  const funnelSummary    = summarizeWorkflowFunnel(leadsRaw, purchaseOrdersRaw, inventoryRaw.length);

  // Recovery analyses
  const recoveryInvByAsin = new Map(recoveryProducts.inventory.map((i: any) => [i.asin, i]));
  const recoveryRepByAsin = new Map(recoveryProducts.repricing.map((r: any) => [r.asin, r]));
  const recoveryProdByAsin = new Map(recoveryProducts.products.map((p: any) => [p.asin, p]));

  const recoveryAnalyses = reimbursementsRaw.map((r: any) => {
    const inv  = r.asin ? recoveryInvByAsin.get(r.asin)  : undefined;
    const rep  = r.asin ? recoveryRepByAsin.get(r.asin)  : undefined;
    const prod = r.asin ? recoveryProdByAsin.get(r.asin) : undefined;
    return analyseReimbursement(
      { reimbursementId: r.reimbursementId, approvalDate: r.approvalDate, caseId: r.caseId, amazonOrderId: r.amazonOrderId, reason: r.reason, sku: r.sku, fnsku: r.fnsku, asin: r.asin, productName: r.productName, condition: r.condition, currencyUnit: r.currencyUnit, amountPerUnit: r.amountPerUnit, amountTotal: r.amountTotal, quantityReimbursedCash: r.quantityReimbursedCash, quantityReimbursedInventory: r.quantityReimbursedInventory, quantityReimbursedTotal: r.quantityReimbursedTotal, originalReimbursementId: r.originalReimbursementId, originalReimbursementType: r.originalReimbursementType, rawPayload: r.rawPayload as Record<string, string> },
      { inventoryUnitCost: inv?.unitCost ?? null, repricingCostBasis: rep?.costBasis ?? null, productSourcePrice: prod?.sourcePrice ?? null, productTotalLandedCost: prod?.totalLandedCost ?? null },
    );
  });

  const recoverySummary = summarizeRecovery(
    recoveryAnalyses,
    lastSync ? { status: lastSync.status, startedAt: lastSync.startedAt, completedAt: lastSync.completedAt, source: lastSync.source } : null,
  );

  // Sales BI summary (PRO only)
  const salesSummary = summarizeSales(
    salesRawBI,
    lastSalesSync ? { status: lastSalesSync.status, startedAt: lastSalesSync.startedAt, source: lastSalesSync.source } : undefined,
  );

  // Action center
  const actions = buildActionItems({
    pendingProposals:        repricingSummary.pendingProposals,
    failedPushes:            repricingSummary.failedPushes,
    pendingPOUnits:          poSummary.pendingUnits,
    openPOCount:             poSummary.ordered + poSummary.partiallyReceived,
    totalPOs:                poSummary.total,
    rulesMissingCost:        repricingSummary.rulesMissingCost,
    staleRepricingRules:     repricingSummary.staleActiveRules,
    inventoryMissingCost:    invSummary.itemsMissingCost,
    inventoryMissingProduct: invSummary.itemsMissingProduct,
    possibleUnderpayments:   recoverySummary.possibleUnderpaymentCount,
    inventoryAtRisk:         invSummary.healthCounts.AT_RISK,
    inventoryAging:          invSummary.healthCounts.AGING,
    salesMissingCost:        isPro ? salesSummary.recordsMissingCost : 0,
    salesSyncOverdue:        isPro && !salesSummary.hasData,
    salesMissingFees:        isPro ? salesSummary.recordsMissingFees : 0,
    settlementUnmatched:             isPro ? settlementUnmatchedCount : 0,
    refundRowsStored:                isPro ? refundRowsStored : 0,
    unsupportedSettlementRowsStored: isPro ? unsupportedSettlementRowsStored : 0,
  });

  // ── Getting Started checklist ─────────────────────────────────────────────
  const amazonConnected = !!amazonCred?.isActive;
  const gettingStarted = [
    {
      key:       'plan',
      title:     'Explore Pro features',
      desc:      'Pro ($50/mo) adds Amazon SP-API, Sales & Profit Tracking, Profit Recovery, and Repricing. Starter is fully usable without upgrading.',
      done:      isPro,
      href:      '/dashboard/billing',
      linkLabel: 'View plans',
    },
    {
      key:       'amazon',
      title:     'Connect Amazon',
      desc:      'Connect your Seller Central account so inventory, pricing, and report workflows can use live Amazon data.',
      done:      amazonConnected,
      href:      '/dashboard/amazon',
      linkLabel: 'Connect now',
    },
    {
      key:       'inventory',
      title:     'Add or sync inventory',
      desc:      'Add items manually or sync from Amazon, then confirm SKU, ASIN, and unit cost for each item.',
      done:      inventoryRaw.length > 0,
      href:      '/dashboard/inventory',
      linkLabel: 'Go to Inventory',
    },
    {
      key:       'leads',
      title:     'Review leads or run a scan',
      desc:      'Find qualified product opportunities before creating purchase orders.',
      done:      leadsRaw.length > 0,
      href:      '/dashboard/leads',
      linkLabel: 'Lead Feed',
      href2:     '/dashboard/scanner',
      linkLabel2:'Scanner',
    },
    {
      key:       'sales',
      title:     'Import sales reports',
      desc:      isPro
        ? 'Import orders first, then settlement reports to add fees and calculate realized profit.'
        : 'Sales report imports require Pro. Upgrade your plan to unlock this step.',
      done:      salesRawBI.length > 0,
      href:      '/dashboard/sales',
      linkLabel: 'Go to Sales',
    },
    {
      key:       'repricing',
      title:     'Configure repricing last',
      desc:      'Set up repricing only after inventory and costs are correct. Price pushes still require review and approval.',
      done:      repricingRulesRaw.length > 0,
      href:      '/dashboard/repricing',
      linkLabel: 'Go to Repricing',
    },
  ] as const;
  const completedCount = gettingStarted.filter((s) => s.done).length;
  const allDone        = completedCount === gettingStarted.length;

  // Weekly chart data
  const avgRoi     = leadStats[0]?.avg_roi ?? 0;
  const countsByDay = new Map(weeklyLeads.map((d) => [d.day.toDateString(), Number(d.count)]));
  const weeklyData  = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return { label: DAY_LABELS[date.getDay()], count: countsByDay.get(date.toDateString()) ?? 0 };
  });

  // Executive summary cards
  const execCards = [
    {
      label: 'Active Leads',
      value: (leadSummary.newCount + leadSummary.saved).toLocaleString(),
      sub:   `+${leadSummary.newToday} today`,
      icon:  TrendingUp,
      color: 'text-blue-400',
      bg:    'bg-blue-500/10',
      href:  leadSummary.newToday > 0 ? '/dashboard/leads?dateFilter=today' : '/dashboard/leads',
    },
    {
      label: 'Purchased Leads',
      value: leadSummary.purchased.toLocaleString(),
      sub:   leadSummary.purchased > 0 ? 'turned into orders' : 'No purchases yet',
      icon:  CheckCircle2,
      color: 'text-violet-400',
      bg:    'bg-violet-500/10',
      href:  '/dashboard/leads',
    },
    {
      label: 'Open POs',
      value: (poSummary.ordered + poSummary.partiallyReceived).toLocaleString(),
      sub:   poSummary.pendingUnits > 0 ? `${poSummary.pendingUnits} units pending` : 'None pending',
      icon:  ShoppingCart,
      color: 'text-amber-400',
      bg:    'bg-amber-500/10',
      href:  '/dashboard/orders',
    },
    {
      label: 'Inventory Items',
      value: invSummary.totalItems.toLocaleString(),
      sub:   invSummary.availableUnits > 0 ? `${invSummary.availableUnits.toLocaleString()} available units` : 'No units available',
      icon:  Package,
      color: 'text-emerald-400',
      bg:    'bg-emerald-500/10',
      href:  '/dashboard/inventory',
    },
    {
      label: 'Inventory Value',
      value: invSummary.itemsWithKnownCost > 0 ? formatCurrency(invSummary.knownInventoryValue) : '—',
      sub:   invSummary.itemsWithKnownCost > 0
        ? `${invSummary.itemsWithKnownCost} items with known cost`
        : 'Add unit cost to calculate',
      icon:  Wallet,
      color: 'text-green-400',
      bg:    'bg-green-500/10',
      href:  '/dashboard/inventory',
    },
    {
      label: 'Inventory at Attention',
      value: (invSummary.healthCounts.AT_RISK + invSummary.healthCounts.AGING + invSummary.healthCounts.LOW_MARGIN).toLocaleString(),
      sub:   invSummary.hasData
        ? `${invSummary.healthCounts.AT_RISK} at risk · ${invSummary.healthCounts.AGING} aging`
        : 'No inventory yet',
      icon:  BarChart3,
      color: invSummary.healthCounts.AT_RISK > 0 ? 'text-red-400' : 'text-slate-400',
      bg:    invSummary.healthCounts.AT_RISK > 0 ? 'bg-red-500/10' : 'bg-slate-800',
      href:  '/dashboard/inventory',
    },
    {
      label: 'Repricing Proposals',
      value: repricingSummary.pendingProposals.toLocaleString(),
      sub:   repricingSummary.hasData
        ? `${repricingSummary.activeRules} active rule${repricingSummary.activeRules !== 1 ? 's' : ''}`
        : 'No rules yet',
      icon:  RefreshCw,
      color: repricingSummary.pendingProposals > 0 ? 'text-blue-400' : 'text-slate-400',
      bg:    repricingSummary.pendingProposals > 0 ? 'bg-blue-500/10' : 'bg-slate-800',
      href:  '/dashboard/repricing',
      proOnly: true,
    },
    {
      label: 'Recovery Entries',
      value: recoverySummary.hasData ? recoverySummary.totalEntries.toLocaleString() : '—',
      sub:   recoverySummary.hasData
        ? recoverySummary.possibleUnderpaymentCount > 0
          ? `${recoverySummary.possibleUnderpaymentCount} possible underpayment${recoverySummary.possibleUnderpaymentCount !== 1 ? 's' : ''}`
          : `${formatCurrency(recoverySummary.totalReimbursed)} reimbursed`
        : 'Import report to unlock',
      icon:  ShieldCheck,
      color: recoverySummary.possibleUnderpaymentCount > 0 ? 'text-amber-400' : 'text-slate-400',
      bg:    recoverySummary.possibleUnderpaymentCount > 0 ? 'bg-amber-500/10' : 'bg-slate-800',
      href:  '/dashboard/recovery',
      proOnly: true,
    },
  ] as const;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">

      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Business Intelligence</h1>
          <p className="page-subtitle">
            {!allDone ? 'Set up your account — then your workflow appears here.' : 'Your full workflow at a glance.'}
          </p>
        </div>
        <Link href="/dashboard/leads" className="btn-primary">
          <TrendingUp className="w-4 h-4" />
          View lead feed
        </Link>
      </div>

      {/* ── Getting Started Checklist ── */}
      {!allDone && (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <div>
              <h2 className="font-semibold text-slate-50">Getting Started</h2>
              <p className="text-xs text-slate-500 mt-0.5">Follow these steps to set up EALLsource safely.</p>
            </div>
            <span className="text-xs font-medium text-slate-400">
              {completedCount} of {gettingStarted.length} complete
            </span>
          </div>
          <div className="divide-y divide-slate-800/60">
            {gettingStarted.map((item) => (
              <div key={item.key} className={`flex items-start gap-3 px-5 py-3.5 ${item.done ? 'opacity-50' : ''}`}>
                <div className="flex-shrink-0 mt-0.5">
                  {item.done
                    ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                    : <div className="w-4 h-4 rounded-full border-2 border-slate-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${item.done ? 'text-slate-500 line-through' : 'text-slate-100'}`}>
                    {item.title}
                  </div>
                  {!item.done && (
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>
                  )}
                </div>
                {!item.done && (
                  <div className="flex-shrink-0 flex flex-col items-end gap-1 mt-0.5">
                    <Link href={item.href} className="text-xs font-medium text-blue-500 hover:text-blue-400 transition-colors whitespace-nowrap">
                      {item.linkLabel} →
                    </Link>
                    {'href2' in item && (
                      <Link href={(item as any).href2} className="text-xs font-medium text-blue-500 hover:text-blue-400 transition-colors whitespace-nowrap">
                        {(item as any).linkLabel2} →
                      </Link>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Executive Summary Cards ── */}
      <section>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {execCards.map((card) => {
            const locked = (card as any).proOnly && !isPro;
            const inner = (
              <>
                <div className="flex items-start justify-between">
                  <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                    <card.icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  {!locked && <ArrowUpRight className="w-4 h-4 text-slate-600" />}
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-semibold text-slate-50">
                    {locked ? <span className="text-slate-600">PRO</span> : card.value}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{card.label}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {locked ? 'Upgrade to unlock' : card.sub}
                  </div>
                </div>
              </>
            );
            return locked ? (
              <Link key={card.label} href="/dashboard/billing" className="card p-5 block opacity-60 hover:opacity-80 transition-opacity">
                {inner}
              </Link>
            ) : (
              <Link key={card.label} href={card.href} className="card p-5 block hover:shadow-md hover:border-slate-700 transition-all">
                {inner}
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Workflow Funnel + Action Center ── */}
      <section className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-50">Workflow Funnel</h2>
          <WorkflowFunnel funnel={funnelSummary} />
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-50 mb-4">Action Center</h2>
          <ActionCenter actions={actions} />
        </div>
      </section>

      {/* ── Inventory + PO + Repricing summaries ── */}
      <section className="grid lg:grid-cols-3 gap-6">

        {/* Inventory Intelligence Summary */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              <h2 className="font-semibold text-slate-50">Inventory Health</h2>
            </div>
            <Link href="/dashboard/inventory" className="text-xs text-blue-500 hover:text-blue-400 transition-colors">View all →</Link>
          </div>
          {!invSummary.hasData ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500 space-y-2">
              <p>No inventory yet. Sync from Amazon or add items manually.</p>
              <Link href="/dashboard/inventory" className="text-blue-400 hover:text-blue-300 text-xs transition-colors">
                Go to Inventory →
              </Link>
            </div>
          ) : (
            <div className="px-5 py-4 space-y-3">
              {(
                [
                  ['HEALTHY',      'Healthy',      'text-green-400',  'bg-green-500/10'],
                  ['REORDER_SOON', 'Reorder soon', 'text-blue-400',   'bg-blue-500/10'],
                  ['AGING',        'Aging',         'text-amber-400',  'bg-amber-500/10'],
                  ['LOW_MARGIN',   'Low margin',    'text-orange-400', 'bg-orange-500/10'],
                  ['AT_RISK',      'At risk',       'text-red-400',    'bg-red-500/10'],
                  ['OVERSTOCKED',  'Overstocked',   'text-slate-400',  'bg-slate-800'],
                  ['UNKNOWN',      'No scan data',  'text-slate-500',  'bg-slate-800/60'],
                ] as [keyof typeof invSummary.healthCounts, string, string, string][]
              ).map(([key, label, color, bg]) => {
                const count = invSummary.healthCounts[key];
                if (count === 0) return null;
                return (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${bg} ${color} border border-current`} />
                      <span className="text-sm text-slate-300">{label}</span>
                    </div>
                    <span className={`text-sm font-semibold ${color}`}>{count}</span>
                  </div>
                );
              })}
              <div className="pt-2 border-t border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Known value</span>
                  <span className="text-slate-300 font-medium">
                    {invSummary.itemsWithKnownCost > 0 ? formatCurrency(invSummary.knownInventoryValue) : 'Add unit cost to calculate'}
                  </span>
                </div>
                {invSummary.itemsMissingCost > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Missing cost</span>
                    <span className="text-amber-400">{invSummary.itemsMissingCost} item{invSummary.itemsMissingCost !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Purchase Order Summary */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-amber-400" />
              <h2 className="font-semibold text-slate-50">Purchase Orders</h2>
            </div>
            <Link href="/dashboard/orders" className="text-xs text-blue-500 hover:text-blue-400 transition-colors">View all →</Link>
          </div>
          {!poSummary.hasData ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500 space-y-2">
              <p>No purchase orders yet. Create one from a lead when you buy inventory.</p>
              <Link href="/dashboard/leads" className="text-blue-400 hover:text-blue-300 text-xs transition-colors">
                Browse leads →
              </Link>
            </div>
          ) : (
            <div className="px-5 py-4 space-y-3">
              {poSummary.ordered > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">Ordered</span>
                  <span className="text-sm font-semibold text-amber-400">{poSummary.ordered}</span>
                </div>
              )}
              {poSummary.partiallyReceived > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">Partially received</span>
                  <span className="text-sm font-semibold text-blue-400">{poSummary.partiallyReceived}</span>
                </div>
              )}
              {poSummary.received > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">Received</span>
                  <span className="text-sm font-semibold text-green-400">{poSummary.received}</span>
                </div>
              )}
              {poSummary.draft > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">Draft</span>
                  <span className="text-sm font-semibold text-slate-400">{poSummary.draft}</span>
                </div>
              )}
              {poSummary.cancelled > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">Cancelled</span>
                  <span className="text-sm font-semibold text-slate-600">{poSummary.cancelled}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Open order cost</span>
                  <span className="text-slate-300 font-medium">
                    {poSummary.openCost > 0 ? formatCurrency(poSummary.openCost) : '—'}
                  </span>
                </div>
                {poSummary.pendingUnits > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Units pending receipt</span>
                    <span className="text-amber-400 font-medium">{poSummary.pendingUnits}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Repricing Summary */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-blue-400" />
              <h2 className="font-semibold text-slate-50">Repricing</h2>
            </div>
            {isPro
              ? <Link href="/dashboard/repricing" className="text-xs text-blue-500 hover:text-blue-400 transition-colors">View all →</Link>
              : <Link href="/dashboard/billing" className="text-xs text-amber-500 hover:text-amber-400 transition-colors">Upgrade →</Link>}
          </div>
          {!isPro ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500">
              Repricing requires a PRO plan.
            </div>
          ) : !repricingSummary.hasData ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500 space-y-2">
              <p>No repricing rules yet. Rules are created automatically when you add inventory items with a listed price.</p>
              <Link href="/dashboard/inventory" className="text-blue-400 hover:text-blue-300 text-xs transition-colors">
                Go to Inventory →
              </Link>
            </div>
          ) : (
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Active rules</span>
                <span className="text-sm font-semibold text-green-400">{repricingSummary.activeRules}</span>
              </div>
              {repricingSummary.pausedRules > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">Paused rules</span>
                  <span className="text-sm font-semibold text-slate-400">{repricingSummary.pausedRules}</span>
                </div>
              )}
              {repricingSummary.pendingProposals > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">Pending proposals</span>
                  <span className="text-sm font-semibold text-blue-400">{repricingSummary.pendingProposals}</span>
                </div>
              )}
              {repricingSummary.failedPushes > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">Failed pushes</span>
                  <span className="text-sm font-semibold text-red-400">{repricingSummary.failedPushes}</span>
                </div>
              )}
              {repricingSummary.recentPushCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">Pushed (7d)</span>
                  <span className="text-sm font-semibold text-slate-300">{repricingSummary.recentPushCount}</span>
                </div>
              )}
              {repricingSummary.rulesMissingCost > 0 && (
                <div className="pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-1.5 text-xs text-amber-400/80">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    {repricingSummary.rulesMissingCost} rule{repricingSummary.rulesMissingCost !== 1 ? 's' : ''} missing cost basis
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Recovery + Charts + Top Leads ── */}
      <section className="grid lg:grid-cols-3 gap-6">

        {/* Profit Recovery Summary */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-violet-400" />
              <h2 className="font-semibold text-slate-50">Profit Recovery</h2>
            </div>
            {isPro
              ? <Link href="/dashboard/recovery" className="text-xs text-blue-500 hover:text-blue-400 transition-colors">View all →</Link>
              : <Link href="/dashboard/billing" className="text-xs text-amber-500 hover:text-amber-400 transition-colors">Upgrade →</Link>}
          </div>
          {!isPro ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500">
              Profit Recovery requires a PRO plan.
            </div>
          ) : !recoverySummary.hasData ? (
            <div className="px-5 py-8 text-center space-y-2">
              <div className="text-sm text-slate-500">No reimbursement data yet.</div>
              <Link href="/dashboard/recovery" className="text-xs text-blue-500 hover:text-blue-400 transition-colors">
                Import reimbursement report →
              </Link>
            </div>
          ) : (
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Total entries</span>
                <span className="text-sm font-semibold text-slate-50">{recoverySummary.totalEntries}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Total reimbursed</span>
                <span className="text-sm font-semibold text-green-400">{formatCurrency(recoverySummary.totalReimbursed)}</span>
              </div>
              {recoverySummary.possibleUnderpaymentCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">Possible underpayments</span>
                  <span className="text-sm font-semibold text-amber-400">{recoverySummary.possibleUnderpaymentCount}</span>
                </div>
              )}
              {recoverySummary.totalPossibleShortfall > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">Possible shortfall</span>
                  <span className="text-sm font-semibold text-amber-400">{formatCurrency(recoverySummary.totalPossibleShortfall)}</span>
                </div>
              )}
              {recoverySummary.missingCostCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">Missing cost data</span>
                  <span className="text-sm font-semibold text-slate-500">{recoverySummary.missingCostCount}</span>
                </div>
              )}
              {recoverySummary.lastSyncAt && (
                <div className="pt-2 border-t border-slate-800">
                  <div className="text-xs text-slate-500">
                    Last sync: {relativeTime(recoverySummary.lastSyncAt)}
                    {recoverySummary.lastSyncStatus === 'FAILED' && (
                      <span className="text-red-400 ml-1">· Failed</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sales & Profit Summary */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <h2 className="font-semibold text-slate-50">Sales &amp; Profit</h2>
            </div>
            {isPro
              ? <Link href="/dashboard/sales" className="text-xs text-blue-500 hover:text-blue-400 transition-colors">View all →</Link>
              : <Link href="/dashboard/billing" className="text-xs text-amber-500 hover:text-amber-400 transition-colors">Upgrade →</Link>}
          </div>
          {!isPro ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500">
              Sales &amp; Profit Tracking requires a PRO plan.
            </div>
          ) : !salesSummary.hasData ? (
            <div className="px-5 py-8 text-center space-y-2">
              <div className="text-sm text-slate-500">No sales data yet.</div>
              <Link href="/dashboard/sales" className="text-xs text-blue-500 hover:text-blue-400 transition-colors">
                Import orders report →
              </Link>
            </div>
          ) : (
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Gross revenue</span>
                <span className="text-sm font-semibold text-slate-50">{formatCurrency(salesSummary.totalGrossRevenue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Units sold</span>
                <span className="text-sm font-semibold text-blue-400">{salesSummary.totalUnitsSold.toLocaleString()}</span>
              </div>
              {salesSummary.totalGrossProfitBeforeFees !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">
                    {salesSummary.recordsWithFees > 0 ? 'Realized profit' : 'Gross profit (before fees)'}
                  </span>
                  <span className={`text-sm font-semibold ${(salesSummary.totalRealizedProfit ?? salesSummary.totalGrossProfitBeforeFees) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatCurrency(salesSummary.totalRealizedProfit ?? salesSummary.totalGrossProfitBeforeFees)}
                  </span>
                </div>
              )}
              {salesSummary.recordsMissingCost > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Missing cost data</span>
                  <span className="text-amber-400">{salesSummary.recordsMissingCost} record{salesSummary.recordsMissingCost !== 1 ? 's' : ''}</span>
                </div>
              )}
              {salesSummary.recordsMissingFees > 0 && (
                <div className="pt-2 border-t border-slate-800">
                  <div className="text-xs text-amber-400/80">
                    Amazon fees not imported yet — profit is incomplete because fees are missing
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ROI Gauge + Weekly Chart */}
        <div className="lg:col-span-2 grid sm:grid-cols-2 gap-4">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-50 mb-2">Avg Lead ROI</h2>
            <RoiGauge avgRoi={avgRoi} />
          </div>
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-50 mb-2">New Leads — Last 7 Days</h2>
            <WeeklyLeadsChart data={weeklyData} />
          </div>
        </div>
      </section>

      {/* ── Top Leads + Recent Jobs ── */}
      <section className="grid lg:grid-cols-3 gap-6">
        <div className={`${isOwner ? 'lg:col-span-2' : 'lg:col-span-3'} card overflow-hidden`}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-blue-500" />
              <h2 className="font-semibold text-slate-50">Top leads</h2>
            </div>
            <Link href="/dashboard/leads" className="text-xs font-medium text-blue-600 hover:text-blue-400 transition-colors">
              View all →
            </Link>
          </div>
          {topLeads.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              {isOwner ? (
                <>
                  <p className="text-sm text-slate-400">No leads yet — run a scan or check your Lead Feed to get started.</p>
                  <div className="flex items-center justify-center gap-3">
                    <Link href="/dashboard/scanner" className="text-xs font-medium text-blue-500 hover:text-blue-400 transition-colors">
                      Go to Scanner →
                    </Link>
                    <span className="text-slate-700">·</span>
                    <Link href="/dashboard/leads" className="text-xs font-medium text-blue-500 hover:text-blue-400 transition-colors">
                      Open Lead Feed →
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-400">Leads arrive weekly on Monday at 6:00 AM (Arizona time). Your first drop will appear here.</p>
                  <Link href="/dashboard/leads" className="text-xs font-medium text-blue-500 hover:text-blue-400 transition-colors">
                    Open Lead Feed →
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {topLeads.map((lead) => {
                const { label, color } = scoreLabel(lead.score);
                return (
                  <Link
                    key={lead.id}
                    href={`/dashboard/leads/${lead.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-800/40"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-50 truncate">{lead.product.title}</div>
                      <div className="text-xs mt-0.5 flex items-center gap-2 text-slate-400">
                        <span className="font-mono">{lead.product.asin}</span>
                        {lead.product.sourceRetailer && (
                          <>
                            <span className="text-slate-600">·</span>
                            <span>{lead.product.sourceRetailer}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-green-400">{formatCurrency(lead.product.profit)}</div>
                      <div className="text-xs text-slate-400">{lead.product.roi.toFixed(1)}% ROI</div>
                    </div>
                    <div className={`text-xs font-bold w-12 text-center ${color}`}>
                      <div className="text-lg leading-none">{lead.score}</div>
                      <div className="text-[10px]">{label}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {isOwner && (
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800">
              <Clock className="w-4 h-4 text-slate-500" />
              <h2 className="font-semibold text-slate-50">Recent jobs</h2>
            </div>
            {recentJobs.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">No jobs run yet.</div>
            ) : (
              <div className="divide-y divide-slate-800">
                {recentJobs.map((job) => (
                  <div key={job.id} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-100 capitalize">
                        {job.type.toLowerCase()}
                      </span>
                      <span className={`badge text-xs ${
                        job.status === 'DONE'    ? 'bg-green-500/15 text-green-400' :
                        job.status === 'FAILED'  ? 'bg-red-500/15 text-red-400'    :
                        job.status === 'RUNNING' ? 'bg-blue-500/15 text-blue-400'  :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {job.status === 'DONE' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                        {job.status}
                      </span>
                    </div>
                    {job.retailer && <div className="text-xs mt-0.5 text-slate-400">{job.retailer}</div>}
                    <div className="text-xs mt-1 text-slate-500">{relativeTime(job.createdAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
