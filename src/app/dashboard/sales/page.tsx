import { redirect }      from 'next/navigation';
import { auth }          from '@/lib/auth';
import { prisma }        from '@/lib/prisma';
import Link              from 'next/link';
import { formatCurrency } from '@/lib/utils';
import {
  summarizeSales,
  getSaleProfitStatus,
  parseSalesFilter,
} from '@/engines/salesTracking';
import { PageGuide }               from '@/components/ui/PageGuide';
import { SalesImportModal }        from '@/components/sales/SalesImportModal';
import { SalesSettlementModal }    from '@/components/sales/SalesSettlementModal';
import { RefundAdjustmentModal }   from '@/components/sales/RefundAdjustmentModal';
import { SalesFeedTable, type SerializedSaleRow, type MissingFeesGuidance } from '@/components/sales/SalesFeedTable';
import {
  DollarSign, TrendingUp, Package, AlertTriangle,
  Info, Zap, History, CheckCircle2, BarChart3,
} from 'lucide-react';

export const dynamic  = 'force-dynamic';
export const metadata = { title: 'Sales & Profit' };

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  return formatCurrency(v);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toFixed(1)}%`;
}

function fmtUnits(v: number): string {
  return v.toLocaleString();
}

function fmtShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function relDate(d: Date | null | undefined): string {
  if (!d) return 'Never';
  const diff = Math.floor((Date.now() - d.getTime()) / 1000 / 60 / 60);
  if (diff < 1)  return 'Just now';
  if (diff < 24) return `${diff}h ago`;
  return `${Math.floor(diff / 24)}d ago`;
}

// ─── Page ────────────────────────────────────────────────────────────────────

interface Props { searchParams: Promise<{ status?: string }> }

export default async function SalesPage({ searchParams: searchParamsPromise }: Props) {
  const [session, sp] = await Promise.all([auth(), searchParamsPromise]);
  if (!session?.user) redirect('/login');

  const { role, orgId, plan } = session.user;
  if (role === 'VIEWER') redirect('/dashboard');

  const initialFilter = parseSalesFilter(sp.status);

  // PRO gate
  if (plan === 'STARTER') {
    return (
      <div className="p-6 lg:p-8 max-w-xl">
        <div className="card p-10 text-center">
          <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Zap className="w-7 h-7 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-50 mb-2">Sales &amp; Profit Tracking requires Pro</h2>
          <p className="text-slate-400 text-sm mb-5 leading-relaxed">
            Upgrade to Pro to import your Amazon orders report and see actual revenue,
            units sold, gross profit, and top-performing SKUs.
          </p>
          <ul className="text-left text-sm text-slate-400 space-y-2 mb-6 inline-block">
            {[
              'Import Amazon flat-file orders reports',
              'Track revenue and units sold per ASIN/SKU',
              'See gross profit where unit cost is known',
              'Identify top-selling products',
              'Action Center alerts for missing cost data',
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="text-blue-400">✓</span> {f}
              </li>
            ))}
          </ul>
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
          >
            <Zap className="w-4 h-4" />
            Upgrade to Pro →
          </Link>
        </div>
      </div>
    );
  }

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const [salesRaw, recentSyncs, missingFeesAgg, lastSettlementSync, missingFeeSkusRaw, refundRowsCount, unsupportedRowsCount] = await Promise.all([
    prisma.saleRecord.findMany({
      where:   { orgId },
      orderBy: { saleDate: 'desc' },
      take:    200,
      select: {
        id:                    true,
        asin:                  true,
        sku:                   true,
        productName:           true,
        saleDate:              true,
        quantitySold:          true,
        grossRevenue:          true,
        netRevenue:            true,
        totalFees:             true,
        cogs:                  true,
        grossProfitBeforeFees: true,
        realizedProfit:        true,
        roi:                   true,
        unitCostUsed:          true,
        costSource:            true,
        fulfillmentChannel:    true,
        orderStatus:           true,
        promotionDiscount:     true,
      },
    }),
    prisma.salesSync.findMany({
      where:   { orgId },
      orderBy: { startedAt: 'desc' },
      take:    5,
      select:  { id: true, source: true, status: true, startedAt: true, completedAt: true, recordsFound: true, recordsUpserted: true, error: true },
    }),
    prisma.saleRecord.aggregate({
      where: { orgId, totalFees: null },
      _count: { _all: true },
      _min:   { saleDate: true },
      _max:   { saleDate: true },
    }),
    prisma.salesSync.findFirst({
      where:   { orgId, source: 'MANUAL_SETTLEMENT', status: 'DONE' },
      orderBy: { completedAt: 'desc' },
      select:  { completedAt: true },
    }),
    prisma.saleRecord.findMany({
      where:  { orgId, totalFees: null, sku: { not: null } },
      select: { sku: true },
      distinct: ['sku'],
    }),
    prisma.settlementRecord.count({ where: { orgId, transactionType: 'Refund' } }),
    prisma.settlementRecord.count({ where: { orgId, transactionType: { not: { in: ['Order', 'Refund'] } } } }),
  ]);

  const lastSync = recentSyncs[0] ?? null;

  const summary = summarizeSales(
    salesRaw.map((r) => ({
      saleDate:              r.saleDate,
      quantitySold:          r.quantitySold,
      grossRevenue:          r.grossRevenue,
      netRevenue:            r.netRevenue,
      totalFees:             r.totalFees,
      cogs:                  r.cogs,
      grossProfitBeforeFees: r.grossProfitBeforeFees,
      realizedProfit:        r.realizedProfit,
      roi:                   r.roi,
      asin:                  r.asin,
      sku:                   r.sku,
      unitCostUsed:          r.unitCostUsed,
      costSource:            r.costSource,
    })),
    lastSync
      ? { status: lastSync.status, startedAt: lastSync.startedAt, completedAt: lastSync.completedAt ?? undefined, source: lastSync.source }
      : undefined,
  );

  const isOwnerOrAdmin = role === 'OWNER' || role === 'ADMIN';

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!summary.hasData) {
    return (
      <div className="p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Sales &amp; Profit</h1>
            <p className="text-sm text-slate-400 mt-0.5">Track revenue and profit from your Amazon sales</p>
          </div>
          {isOwnerOrAdmin && <SalesImportModal />}
        </div>
        <div className="card p-10 text-center max-w-lg mx-auto mt-12">
          <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <DollarSign className="w-7 h-7 text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold text-slate-100 mb-2">No sales data yet</h2>
          <p className="text-sm text-slate-400 mb-5 leading-relaxed">
            Import your Amazon flat-file orders report to see units sold, revenue, and gross profit.
            Cancelled and pending orders are automatically excluded.
          </p>
          {!isOwnerOrAdmin ? (
            <p className="text-xs text-slate-500">Ask an owner or admin to import the orders report.</p>
          ) : (
            <SalesImportModal />
          )}
        </div>
      </div>
    );
  }

  // ── Status counts (server-side — for summary cards + banners) ─────────────
  const statusCounts = { complete: 0, grossOnly: 0, missingCost: 0, noProfitData: 0, incomplete: 0 };
  for (const r of salesRaw) {
    const s = getSaleProfitStatus(r);
    if      (s === 'COMPLETE')        statusCounts.complete++;
    else if (s === 'GROSS_ONLY')      statusCounts.grossOnly++;
    else if (s === 'MISSING_COST')    statusCounts.missingCost++;
    else if (s === 'INCOMPLETE')      statusCounts.incomplete++;
    else                              statusCounts.noProfitData++;
  }

  // Distinct SKU/ASIN count for missing-cost banner
  const missingCostSkuCount = new Set(
    salesRaw
      .filter(r => r.unitCostUsed === null)
      .map(r => r.sku ?? r.asin)
      .filter((x): x is string => x !== null),
  ).size;

  const allComplete  = summary.totalRecords > 0 && statusCounts.complete === summary.totalRecords;
  const missingFees  = summary.recordsMissingFees > 0;
  const missingCost  = summary.recordsMissingCost > 0;

  // Distinct SKU count from DB — covers all missing-fee rows, not just the 200-row window
  const missingFeeSkuCount = missingFeeSkusRaw.length;

  // Missing-fees guidance data passed to the table's guidance panel
  const missingFeesGuidance: MissingFeesGuidance | null = missingFees
    ? {
        count:                    missingFeesAgg._count._all,
        earliestDate:             missingFeesAgg._min.saleDate?.toISOString() ?? null,
        latestDate:               missingFeesAgg._max.saleDate?.toISOString() ?? null,
        skuCount:                 missingFeeSkuCount,
        lastSettlementImportDate: lastSettlementSync?.completedAt?.toISOString() ?? null,
      }
    : null;

  // ── Serialize rows for client component ───────────────────────────────────
  const serializedRows: SerializedSaleRow[] = salesRaw.map((r) => ({
    ...r,
    saleDate: r.saleDate.toISOString(),
  }));

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales &amp; Profit</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {summary.totalRecords.toLocaleString()} order line{summary.totalRecords !== 1 ? 's' : ''} imported
            {summary.lastSaleDate && (
              <span className="ml-2 text-slate-600">
                · last sale {summary.lastSaleDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
            {lastSync && (
              <span className="ml-2 text-slate-600">· last import {relDate(lastSync.startedAt)}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isOwnerOrAdmin && <SalesImportModal />}
          {isOwnerOrAdmin && <SalesSettlementModal />}
        </div>
      </div>

      {/* Beginner guide */}
      <PageGuide
        storageKey="sales-guide-collapsed"
        title="How profit tracking works"
        subtitle="Import orders first, then settlements. Settlement reports are the source of truth for fees."
        steps={[
          { title: '1. Import Amazon orders', body: 'Download your Fulfilled Shipments or Orders report from Seller Central and import it here to create sale records.' },
          { title: '2. Import settlement reports', body: 'Add your Amazon Settlement Report to apply actual fees — referral fees, FBA fees, and promotions update each order.' },
          { title: '3. Review realized profit', body: 'Once fees are applied, each order shows revenue, cost, fees, ROI, and realized profit. Orders missing fees show estimated profit only.' },
        ]}
        columns={3}
      />

      {/* Data completeness banners */}
      {allComplete ? (
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>All sales have complete profit data.</span>
        </div>
      ) : (missingFees || missingCost) && (
        <div className="space-y-2">
          {missingFees && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-300">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                <strong>
                  {summary.recordsMissingFees.toLocaleString()} sale{summary.recordsMissingFees !== 1 ? 's are' : ' is'} missing settlement fees
                  {missingFeesAgg._min.saleDate && missingFeesAgg._max.saleDate && (
                    <> for sales from {fmtShortDate(missingFeesAgg._min.saleDate)} – {fmtShortDate(missingFeesAgg._max.saleDate)}</>
                  )}
                  .
                </strong>{' '}
                Download the settlement report covering that period from{' '}
                <span className="text-amber-200">Seller Central → Reports → Payments</span>, then import it here.{' '}
                <Link href="/dashboard/sales?status=missing-fees" className="text-amber-200 hover:underline font-medium">
                  View affected rows →
                </Link>
              </span>
            </div>
          )}
          {missingCost && (
            <div className="flex items-start gap-2 bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-3 text-sm text-slate-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                {summary.recordsMissingCost.toLocaleString()} sale{summary.recordsMissingCost !== 1 ? 's' : ''}{' '}
                {missingCostSkuCount > 1 ? `across ${missingCostSkuCount} SKUs ` : ''}
                {summary.recordsMissingCost !== 1 ? 'have' : 'has'} no unit cost.{' '}
                <Link href="/dashboard/inventory" className="text-blue-400 hover:underline">
                  Add cost in Inventory to unlock profit →
                </Link>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Refund / adjustment visibility notice — not applied to profit */}
      {(refundRowsCount > 0 || unsupportedRowsCount > 0) && (
        <div className="flex items-start justify-between gap-3 bg-slate-700/30 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-400">
          <div className="flex items-start gap-2 min-w-0">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Refunds and account-level adjustments have been imported, but they are not yet reflected in realized profit.{' '}
              {refundRowsCount > 0 && (
                <>Refund rows stored: <strong className="text-slate-300">{refundRowsCount.toLocaleString()}</strong>.{' '}</>
              )}
              {unsupportedRowsCount > 0 && (
                <>Adjustment/unsupported rows stored: <strong className="text-slate-300">{unsupportedRowsCount.toLocaleString()}</strong>.</>
              )}
            </span>
          </div>
          {isOwnerOrAdmin && refundRowsCount > 0 && (
            <div className="shrink-0">
              <RefundAdjustmentModal refundRowsCount={refundRowsCount} />
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 — Gross Revenue */}
        <SummaryCard
          icon={DollarSign}
          iconColor="text-blue-400"
          iconBg="bg-blue-500/10"
          label="Gross Revenue"
          value={fmt(summary.totalGrossRevenue)}
          sub={`${fmtUnits(summary.totalUnitsSold)} units sold`}
        />

        {/* Card 2 — Realized Profit (COMPLETE rows only) */}
        <SummaryCard
          icon={TrendingUp}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-500/10"
          label="Realized Profit"
          value={statusCounts.complete > 0 ? fmt(summary.totalRealizedProfit) : '—'}
          sub={
            statusCounts.complete === 0
              ? 'No complete sales yet'
              : statusCounts.complete === summary.totalRecords
              ? 'All sales complete'
              : `${statusCounts.complete} of ${summary.totalRecords} sales complete`
          }
          subColor={
            statusCounts.complete === 0
              ? 'text-slate-600'
              : statusCounts.complete < summary.totalRecords
              ? 'text-amber-400'
              : 'text-emerald-400'
          }
        />

        {/* Card 3 — Avg ROI (realized only) */}
        <SummaryCard
          icon={Package}
          iconColor="text-violet-400"
          iconBg="bg-violet-500/10"
          label="Avg ROI"
          value={summary.avgRoi != null ? fmtPct(summary.avgRoi) : '—'}
          sub={
            statusCounts.complete > 0
              ? `${statusCounts.complete} complete sale${statusCounts.complete !== 1 ? 's' : ''}`
              : 'No realized profit yet'
          }
          subColor={statusCounts.complete === 0 ? 'text-slate-600' : undefined}
        />

        {/* Card 4 — Profit Coverage */}
        <SummaryCard
          icon={BarChart3}
          iconColor={allComplete ? 'text-emerald-400' : 'text-slate-400'}
          iconBg={allComplete ? 'bg-emerald-500/10' : 'bg-slate-700'}
          label="Profit Coverage"
          value={`${statusCounts.complete} / ${summary.totalRecords}`}
          sub={
            allComplete
              ? 'All complete'
              : [
                  statusCounts.grossOnly > 0    ? `${statusCounts.grossOnly} gross only`   : '',
                  statusCounts.incomplete > 0   ? `${statusCounts.incomplete} incomplete`  : '',
                  statusCounts.missingCost > 0  ? `${statusCounts.missingCost} no cost`    : '',
                  statusCounts.noProfitData > 0 ? `${statusCounts.noProfitData} no data`   : '',
                ].filter(Boolean).join(' · ')
          }
          subColor={allComplete ? 'text-emerald-400' : 'text-amber-400'}
        />
      </div>

      {/* Sales Feed — client component with filter tabs */}
      <SalesFeedTable rows={serializedRows} initialFilter={initialFilter} missingFeesGuidance={missingFeesGuidance} />

      {/* Import History */}
      {recentSyncs.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
            <History className="w-3.5 h-3.5 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-300">Import History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: '560px' }}>
              <thead>
                <tr className="border-b border-slate-800 text-slate-500">
                  <th className="text-left px-4 py-2.5 font-medium">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium">Source</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium">Found</th>
                  <th className="text-right px-4 py-2.5 font-medium">Imported</th>
                  <th className="text-left px-4 py-2.5 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {recentSyncs.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                      {s.startedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      <span className="ml-1.5 text-slate-600">
                        {s.startedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">{SYNC_SOURCE_LABELS[s.source] ?? s.source}</td>
                    <td className="px-4 py-2.5">
                      <SyncStatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-400">{s.recordsFound ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-slate-300">{s.recordsUpserted ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-[200px] truncate">{s.error ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components (server-only — import history only) ──────────────────────

const SYNC_SOURCE_LABELS: Record<string, string> = {
  MANUAL_SALES:       'Orders Report',
  MANUAL_SETTLEMENT:  'Settlement Report',
};

function SummaryCard({
  icon: Icon, iconColor, iconBg, label, value, sub, subColor,
}: {
  icon:      React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg:    string;
  label:     string;
  value:     string;
  sub:       string;
  subColor?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <span className="text-xs text-slate-400 leading-tight">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-100 mb-0.5">{value}</div>
      <div className={`text-xs ${subColor ?? 'text-slate-500'}`}>{sub}</div>
    </div>
  );
}

const SYNC_STATUS_STYLES: Record<string, string> = {
  DONE:    'text-emerald-400 bg-emerald-500/10',
  RUNNING: 'text-blue-400 bg-blue-500/10',
  FAILED:  'text-red-400 bg-red-500/10',
};

function SyncStatusBadge({ status }: { status: string }) {
  const cls = SYNC_STATUS_STYLES[status] ?? 'text-slate-400 bg-slate-700';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>
      {status}
    </span>
  );
}
