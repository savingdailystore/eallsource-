import { redirect }  from 'next/navigation';
import { auth }       from '@/lib/auth';
import { prisma }     from '@/lib/prisma';
import Link           from 'next/link';
import {
  DollarSign, AlertTriangle, CheckCircle2,
  HelpCircle, RefreshCw, Package, Clock, ShieldCheck, Zap,
} from 'lucide-react';
import { RecoveryImportModal } from '@/components/reimbursements/RecoveryImportModal';
import { PageGuide }           from '@/components/ui/PageGuide';
import {
  analyseReimbursement,
  buildRecoverySummary,
  type ReimbursementRecoveryAnalysis,
} from '@/engines/reimbursementRecovery';

export const dynamic  = 'force-dynamic';
export const metadata = { title: 'Profit Recovery' };

// ─── Recommendation badge ────────────────────────────────────────────────────

const REC_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  LOOKS_REASONABLE:    { label: 'Looks reasonable',      color: 'text-green-400',  bg: 'bg-green-500/10'  },
  POSSIBLE_UNDERPAYMENT: { label: 'Possible underpayment', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  MISSING_COST_DATA:   { label: 'Missing cost data',     color: 'text-slate-400',  bg: 'bg-slate-800'     },
  MISSING_ASIN_SKU:    { label: 'Review manually',       color: 'text-red-400',    bg: 'bg-red-500/10'    },
  LARGE_REIMBURSEMENT: { label: 'Verify amount',         color: 'text-orange-400', bg: 'bg-orange-500/10' },
  ZERO_AMOUNT:         { label: 'Zero-amount entry',     color: 'text-slate-500',  bg: 'bg-slate-800'     },
};

function RecommendationBadge({ rec }: { rec: string }) {
  const cfg = REC_BADGE[rec] ?? { label: rec, color: 'text-slate-400', bg: 'bg-slate-800' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function RecoveryPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { role, orgId, plan } = session.user;
  if (role === 'VIEWER') redirect('/dashboard');

  if (plan === 'STARTER') {
    return (
      <div className="p-6 lg:p-8 max-w-xl">
        <div className="card p-10 text-center">
          <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Zap className="w-7 h-7 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-50 mb-2">Profit Recovery requires Pro</h2>
          <p className="text-slate-400 text-sm mb-5 leading-relaxed">
            Upgrade to Pro to import your Amazon reimbursement reports and find money you may be owed.
          </p>
          <ul className="text-left text-sm text-slate-400 space-y-2 mb-6 inline-block text-left">
            {[
              'Import Amazon FBA reimbursement reports',
              'Spot possible underpayments vs your unit cost',
              'Flag missing cost data before it hurts you',
              'Review and dispute with Amazon when needed',
              'Full reimbursement history in one place',
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <Link href="/dashboard/billing" className="btn-primary block w-full text-center">
            Upgrade to Pro →
          </Link>
        </div>
      </div>
    );
  }

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const [reimbursements, lastSync, costData] = await Promise.all([
    prisma.reimbursement.findMany({
      where:   { orgId },
      orderBy: { approvalDate: 'desc' },
      take:    200, // cap page for initial render — future: pagination
    }),
    prisma.reimbursementSync.findFirst({
      where:   { orgId },
      orderBy: { startedAt: 'desc' },
    }),
    // Pull cost data for ASINs that appear in reimbursements
    prisma.reimbursement.findMany({
      where:  { orgId },
      select: { asin: true, sku: true },
    }).then(async (rows) => {
      const asins = [...new Set(rows.map((r) => r.asin).filter(Boolean))] as string[];
      const skus  = [...new Set(rows.map((r) => r.sku).filter(Boolean))]  as string[];

      const [inventory, repricing, products] = await Promise.all([
        asins.length > 0
          ? prisma.inventoryItem.findMany({
              where:  { orgId, asin: { in: asins } },
              select: { asin: true, sku: true, unitCost: true },
            })
          : [],
        asins.length > 0
          ? prisma.repricingRule.findMany({
              where:  { orgId, asin: { in: asins } },
              select: { asin: true, costBasis: true },
            })
          : [],
        asins.length > 0
          ? prisma.product.findMany({
              where:  { orgId, asin: { in: asins } },
              select: { asin: true, sourcePrice: true, totalLandedCost: true },
            })
          : [],
      ]);

      return { inventory, repricing, products };
    }),
  ]);

  // Build lookup maps keyed by ASIN
  const inventoryByAsin  = new Map(costData.inventory.map((i)  => [i.asin,  i]));
  const repricingByAsin  = new Map(costData.repricing.map((r)  => [r.asin,  r]));
  const productByAsin    = new Map(costData.products.map((p)   => [p.asin,  p]));

  // Run engine on each row — pure, server-side
  const analyses: ReimbursementRecoveryAnalysis[] = reimbursements.map((r) => {
    const inv  = r.asin ? inventoryByAsin.get(r.asin)  : undefined;
    const rep  = r.asin ? repricingByAsin.get(r.asin)  : undefined;
    const prod = r.asin ? productByAsin.get(r.asin)    : undefined;

    return analyseReimbursement(
      {
        reimbursementId:             r.reimbursementId,
        approvalDate:                r.approvalDate,
        caseId:                      r.caseId,
        amazonOrderId:               r.amazonOrderId,
        reason:                      r.reason,
        sku:                         r.sku,
        fnsku:                       r.fnsku,
        asin:                        r.asin,
        productName:                 r.productName,
        condition:                   r.condition,
        currencyUnit:                r.currencyUnit,
        amountPerUnit:               r.amountPerUnit,
        amountTotal:                 r.amountTotal,
        quantityReimbursedCash:      r.quantityReimbursedCash,
        quantityReimbursedInventory: r.quantityReimbursedInventory,
        quantityReimbursedTotal:     r.quantityReimbursedTotal,
        originalReimbursementId:     r.originalReimbursementId,
        originalReimbursementType:   r.originalReimbursementType,
        rawPayload:                  r.rawPayload as Record<string, string>,
      },
      {
        inventoryUnitCost:      inv?.unitCost       ?? null,
        repricingCostBasis:     rep?.costBasis      ?? null,
        productSourcePrice:     prod?.sourcePrice   ?? null,
        productTotalLandedCost: prod?.totalLandedCost ?? null,
      },
    );
  });

  const summary = buildRecoverySummary(analyses);

  // ── Sync status display ─────────────────────────────────────────────────────
  function syncStatusLabel() {
    if (!lastSync) return null;
    const when = lastSync.completedAt
      ? new Date(lastSync.completedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'in progress';
    return lastSync.status === 'DONE'
      ? `Last synced ${when} · ${lastSync.recordsUpserted ?? 0} records`
      : lastSync.status === 'FAILED'
      ? `Last sync failed ${when}`
      : `Sync ${lastSync.status.toLowerCase()}`;
  }

  const canSync = role === 'OWNER' || role === 'ADMIN';

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Profit Recovery</h1>
          <p className="page-subtitle">
            FBA reimbursements · underpayment analysis · imported from Amazon reports
          </p>
        </div>
        {canSync && (
          <div className="flex items-center gap-3">
            <RecoveryImportModal />
          </div>
        )}
      </div>

      {/* Beginner guide */}
      <PageGuide
        storageKey="recovery-guide-collapsed"
        title="How reimbursement recovery works"
        subtitle="Use Amazon reimbursement reports to find recovery opportunities."
        steps={[
          { title: '1. Download the report from Amazon', body: 'In Seller Central go to Reports → Fulfillment → Reimbursements and request a date range report. Download the CSV when it is ready.' },
          { title: '2. Import it here', body: 'Upload the CSV using the Import button above. The app compares each reimbursement amount against your known unit cost to flag possible underpayments. Reimbursements do not affect Sales & Profit realized profit.' },
          { title: '3. Review underpayments', body: 'Check items flagged as "Possible underpayment" or "Large reimbursement". These may warrant a follow-up case with Amazon Seller Support.' },
        ]}
        columns={3}
      />

      {/* Last sync status bar */}
      {lastSync && (
        <div className={`flex items-center gap-2 text-xs px-4 py-2.5 rounded-xl border ${
          lastSync.status === 'FAILED'
            ? 'border-red-500/20 bg-red-500/10 text-red-300'
            : 'border-slate-800 bg-slate-900/60 text-slate-400'
        }`}>
          {lastSync.status === 'RUNNING' ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
          ) : lastSync.status === 'FAILED' ? (
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          ) : (
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
          )}
          <span>{syncStatusLabel()}</span>
          {lastSync.status === 'FAILED' && lastSync.error && (
            <span className="text-red-400 ml-1">— {lastSync.error}</span>
          )}
          <span className="ml-auto text-slate-600">Source: {lastSync.source === 'SP_API' ? 'Amazon SP-API' : 'Manual import'}</span>
        </div>
      )}

      {/* Summary cards */}
      {reimbursements.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label:   'Total Reimbursed',
              value:   `$${summary.totalReimbursed.toFixed(2)}`,
              icon:    DollarSign,
              color:   'text-green-400',
              bg:      'bg-green-500/10',
              sub:     `${summary.totalRecords} reimbursement${summary.totalRecords !== 1 ? 's' : ''}`,
            },
            {
              label:   'Possible Underpayment',
              value:   summary.possibleUnderpaymentCount > 0
                         ? `$${summary.totalPossibleShortfall.toFixed(2)}`
                         : '—',
              icon:    AlertTriangle,
              color:   summary.possibleUnderpaymentCount > 0 ? 'text-amber-400' : 'text-slate-600',
              bg:      summary.possibleUnderpaymentCount > 0 ? 'bg-amber-500/10' : 'bg-slate-800',
              sub:     summary.possibleUnderpaymentCount > 0
                         ? `${summary.possibleUnderpaymentCount} item${summary.possibleUnderpaymentCount !== 1 ? 's' : ''} flagged`
                         : 'No underpayments detected',
            },
            {
              label:   'Needs Review',
              value:   String(summary.reviewCount),
              icon:    Package,
              color:   summary.reviewCount > 0 ? 'text-orange-400' : 'text-slate-600',
              bg:      summary.reviewCount > 0 ? 'bg-orange-500/10' : 'bg-slate-800',
              sub:     'Underpayment, large amounts, or missing IDs',
            },
            {
              label:   'Missing Cost Data',
              value:   String(summary.missingCostCount),
              icon:    HelpCircle,
              color:   summary.missingCostCount > 0 ? 'text-slate-300' : 'text-slate-600',
              bg:      'bg-slate-800',
              sub:     summary.missingCostCount > 0
                         ? 'Add unit cost to evaluate'
                         : 'All items have cost data',
            },
          ].map((s) => (
            <div key={s.label} className="card p-5">
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
              <div className="text-[10px] text-slate-600 mt-1">{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      {summary.possibleUnderpaymentCount > 0 && (
        <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3">
          <HelpCircle className="w-3.5 h-3.5 text-slate-600 flex-shrink-0 mt-0.5" />
          <span>
            <span className="text-slate-400 font-medium">Possible underpayment</span> is an estimated difference based on your known unit cost —
            not a confirmed claim. Review each flagged item against your purchase records before disputing with Amazon.
          </span>
        </div>
      )}

      {/* Reimbursements table */}
      <div className="card overflow-hidden">
        {reimbursements.length === 0 ? (
          <div className="py-16 text-center">
            <DollarSign className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">No reimbursements imported yet</p>
            {canSync ? (
              <p className="text-sm text-slate-500 mt-1">
                Import your Amazon FBA Reimbursements report to get started.
              </p>
            ) : (
              <p className="text-sm text-slate-500 mt-1">
                Ask an Owner or Admin to import the reimbursements report.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: '720px' }}>
              <thead>
                <tr className="border-b border-slate-800">
                  {['Date', 'ASIN / SKU', 'Product', 'Reason', 'Qty', 'Per Unit', 'Total', 'Unit Cost', 'Est. gap/unit', 'Status'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {analyses.map((a) => (
                  <tr key={a.reimbursementId} className="hover:bg-slate-800/30 transition-colors">
                    {/* Date */}
                    <td className="px-4 py-3 whitespace-nowrap text-slate-400">
                      {new Date(reimbursements.find((r) => r.reimbursementId === a.reimbursementId)!.approvalDate)
                        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>

                    {/* ASIN / SKU */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-slate-300 font-mono text-[10px]">{a.asin ?? '—'}</div>
                      {a.sku && <div className="text-slate-600 text-[10px] mt-0.5">{a.sku}</div>}
                    </td>

                    {/* Product name */}
                    <td className="px-4 py-3 max-w-[200px]">
                      <span className="text-slate-300 line-clamp-2">
                        {a.productName ?? <span className="text-slate-600">Unknown</span>}
                      </span>
                    </td>

                    {/* Reason */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-slate-400 text-[10px] font-mono">
                        {a.reason.replace(/_/g, ' ')}
                      </span>
                    </td>

                    {/* Qty */}
                    <td className="px-4 py-3 text-right whitespace-nowrap text-slate-300">
                      {a.quantityTotal}
                    </td>

                    {/* Per unit */}
                    <td className="px-4 py-3 text-right whitespace-nowrap text-slate-300 font-semibold">
                      ${a.amountPerUnit.toFixed(2)}
                    </td>

                    {/* Total */}
                    <td className="px-4 py-3 text-right whitespace-nowrap text-slate-100 font-semibold">
                      ${a.amountTotal.toFixed(2)}
                    </td>

                    {/* Unit cost */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {a.unitCost != null ? (
                        <span className="text-slate-300">
                          ${a.unitCost.toFixed(2)}
                          <span className="text-slate-600 font-normal text-[9px] ml-1">
                            ({a.unitCostSource})
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Possible difference */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {a.possibleUnderpayment != null ? (
                        <span className="text-amber-400 font-semibold">
                          −${a.possibleUnderpayment.toFixed(2)}/unit
                        </span>
                      ) : a.underpaymentStatus === 'OK' ? (
                        <span className="text-green-500 text-[10px]">✓ ok</span>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>

                    {/* Recommendation */}
                    <td className="px-4 py-3">
                      <RecommendationBadge rec={a.recommendation} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {reimbursements.length >= 200 && (
              <div className="px-4 py-3 text-xs text-slate-500 border-t border-slate-800">
                Showing most recent 200 records.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
