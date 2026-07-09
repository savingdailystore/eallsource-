import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/utils';
import { ArrowUp, ArrowDown, Minus, Zap, AlertTriangle } from 'lucide-react';
import { RunAllButton } from '@/components/repricing/RunAllButton';
import { EditRuleModal } from '@/components/repricing/EditRuleModal';
import { DeleteRuleButton } from '@/components/repricing/DeleteRuleButton';
import { ToggleRuleButton } from '@/components/repricing/ToggleRuleButton';
import { ProposalsPanel } from '@/components/repricing/ProposalsPanel';
import { RepricingGuide } from '@/components/repricing/RepricingGuide';
import { ReadinessBadge, HealthBadge } from '@/components/repricing/ReadinessBadge';
import {
  computeRepricingReadiness,
  computeHealthScore,
  computeRiskFactors,
  riskScoreToLevel,
  estimateFloorBreakdown,
  STRATEGY_META,
  type ReadinessResult,
  type HealthResult,
} from '@/engines/repricingReadiness';
import { detectSkuMismatch, detectCostMismatch } from '@/engines/repricingGuards';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Repricing' };

const DIRECTION_ICON = {
  UP:   { icon: ArrowUp,   cls: 'text-green-400' },
  DOWN: { icon: ArrowDown, cls: 'text-red-400' },
  HOLD: { icon: Minus,     cls: 'text-slate-500' },
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PUSHED:   { label: 'Pushed live',     cls: 'bg-green-500/15 text-green-400' },
  FAILED:   { label: 'Failed',          cls: 'bg-red-500/15 text-red-400' },
  REJECTED: { label: 'Dismissed',       cls: 'bg-slate-700 text-slate-400' },
  HOLD:     { label: 'No change needed', cls: 'bg-slate-700 text-slate-400' },
};

type RuleWithReadiness = {
  id:                   string;
  asin:                 string;
  title:                string | null;
  strategy:             string;
  minRoi:               number;
  minProfit:            number;
  costBasis:            number | null;
  floorPrice:           number | null;
  isActive:             boolean;
  lastRecommendedPrice: number | null;
  lastDirection:        string | null;
  lastRepricedAt:       Date | null;
  history:              Array<{ direction: string; status: string; reason?: string | null; sku?: string | null }>;
  sku:                  string | null;
  readiness:            ReadinessResult;
  health:               HealthResult;
  holdReason:           string | null;
  // Warning flags computed from guard checks
  skuMismatch:          boolean;
  costBasisMismatch:    boolean;
  availableQuantity:    number | null;
  inventoryUnitCost:    number | null;
};

function RulesTable({ rules }: { rules: RuleWithReadiness[] }) {
  if (rules.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500 text-sm">
        No rules here yet. Add inventory items with a listed price, then click
        <span className="font-medium text-slate-300"> Run All Now</span> to auto-generate rules.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-800/40">
            {[
              ['ASIN', ''],
              ['Product', ''],
              ['Status', ''],
              ['Strategy', ''],
              ['Unit Cost', 'What you paid per unit — used to calculate your safe price floor'],
              ['Price Floor', 'The lowest price EALLsource will ever recommend for this product'],
              ['Last Price', ''],
              ['Direction', ''],
              ['Last Run', ''],
              ['', ''],
            ].map(([h, tip]) => (
              <th key={h} className="table-th" title={tip || undefined}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rules.map((rule) => {
            const dir  = ((rule.history?.[0]?.direction ?? rule.lastDirection ?? 'HOLD') as 'UP' | 'DOWN' | 'HOLD');
            const { icon: DirIcon, cls } = DIRECTION_ICON[dir];
            const stratMeta = STRATEGY_META[rule.strategy];
            return (
              <tr key={rule.id} className={`hover:bg-slate-800/40 ${rule.isActive ? '' : 'opacity-60'}`}>
                <td className="table-td font-mono text-xs text-slate-400">{rule.asin}</td>
                <td className="table-td">
                  <div className="font-medium text-slate-50 max-w-xs truncate">{rule.title ?? '—'}</div>
                </td>
                <td className="table-td">
                  <div className="flex flex-col gap-1">
                    <ReadinessBadge readiness={rule.readiness} />
                    <HealthBadge health={rule.health} />
                    {rule.holdReason && (
                      <div className="text-[10px] text-slate-500 italic truncate max-w-[180px]" title={rule.holdReason}>
                        {rule.holdReason}
                      </div>
                    )}
                    {rule.skuMismatch && (
                      <div className="text-[10px] text-amber-400 flex items-center gap-0.5" title="SKU does not match current inventory. Verify Seller Central before pushing prices.">
                        <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
                        SKU mismatch
                      </div>
                    )}
                    {rule.costBasisMismatch && (
                      <div className="text-[10px] text-amber-400 flex items-center gap-0.5" title="Cost basis differs significantly from inventory unit cost. Review before repricing.">
                        <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
                        Cost mismatch
                      </div>
                    )}
                    {rule.availableQuantity !== null && rule.availableQuantity <= 0 && (
                      <div className="text-[10px] text-slate-500 flex items-center gap-0.5" title="No inventory on hand — repricing is paused until units are restocked.">
                        <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
                        No stock
                      </div>
                    )}
                  </div>
                </td>
                <td className="table-td">
                  <span className="badge bg-slate-800 text-slate-300 text-xs">
                    {stratMeta?.label ?? rule.strategy}
                  </span>
                </td>
                <td className="table-td">
                  {rule.costBasis != null
                    ? formatCurrency(rule.costBasis)
                    : <span className="text-amber-400/80 text-xs" title="Set a unit cost to protect your margin">Not set</span>}
                </td>
                <td className="table-td text-slate-300">
                  {rule.floorPrice != null ? formatCurrency(rule.floorPrice) : '—'}
                </td>
                <td className="table-td font-medium">
                  {rule.lastRecommendedPrice ? formatCurrency(rule.lastRecommendedPrice) : '—'}
                </td>
                <td className="table-td">
                  <DirIcon className={`w-4 h-4 ${cls}`} />
                </td>
                <td className="table-td text-slate-400 text-xs">
                  {rule.lastRepricedAt ? new Date(rule.lastRepricedAt).toLocaleString() : 'Never'}
                </td>
                <td className="table-td">
                  <div className="flex items-center gap-0.5">
                    <ToggleRuleButton id={rule.id} isActive={rule.isActive} />
                    <EditRuleModal rule={rule} readiness={rule.readiness} />
                    <DeleteRuleButton id={rule.id} asin={rule.asin} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function RepricingPage() {
  const session = await auth();

  if (session!.user.plan === 'STARTER') {
    return (
      <div className="p-6 lg:p-8 max-w-xl">
        <div className="card p-10 text-center">
          <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Zap className="w-7 h-7 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-50 mb-2">Repricing requires Pro</h2>
          <p className="text-slate-400 text-sm mb-5">
            Rule-based repricing with a manual approval queue keeps you competitive while protecting your margins.
            Upgrade to Pro to unlock this feature.
          </p>
          <a href="/dashboard/billing" className="btn-primary">Upgrade to Pro →</a>
        </div>
      </div>
    );
  }

  const orgId = session!.user.orgId;

  const [rules, history, proposalRows, inventoryItems] = await Promise.all([
    prisma.repricingRule.findMany({
      where:   { orgId },
      orderBy: { updatedAt: 'desc' },
      include: { history: { orderBy: { createdAt: 'desc' }, take: 1, select: { direction: true, status: true, reason: true, sku: true } } },
    }),
    prisma.repricingHistory.findMany({
      where:   { rule: { orgId }, status: { in: ['PUSHED', 'FAILED', 'REJECTED'] } },
      orderBy: { createdAt: 'desc' },
      take:    20,
      include: { rule: { select: { asin: true, title: true } } },
    }),
    prisma.repricingHistory.findMany({
      where:   { rule: { orgId }, status: 'PROPOSED' },
      orderBy: { recommendedPrice: 'desc' },
      include: {
        rule: {
          select: {
            asin: true, title: true, strategy: true,
            minRoi: true, minProfit: true, costBasis: true, floorPrice: true,
          },
        },
      },
    }),
    prisma.inventoryItem.findMany({
      where:  { orgId },
      select: { asin: true, sku: true, availableQuantity: true, unitCost: true },
    }),
  ]);

  // ── Inventory maps (ASIN → value) ───────────────────────────────────────────
  const skuByAsin      = new Map<string, string>();
  const qtyByAsin      = new Map<string, number>();
  const unitCostByAsin = new Map<string, number>();
  for (const item of inventoryItems) {
    if (item.sku && !skuByAsin.has(item.asin)) skuByAsin.set(item.asin, item.sku);
    if (!qtyByAsin.has(item.asin))             qtyByAsin.set(item.asin, item.availableQuantity ?? 0);
    if (item.unitCost != null && !unitCostByAsin.has(item.asin)) unitCostByAsin.set(item.asin, item.unitCost);
  }

  // ── Proposals (enriched) ────────────────────────────────────────────────────
  const pendingRuleIds = new Set(proposalRows.map((p) => p.ruleId));

  const proposals = proposalRows.map((p) => {
    const floorBreakdown = p.rule.costBasis != null
      ? estimateFloorBreakdown(p.rule.costBasis, p.rule.minRoi, p.rule.minProfit, p.rule.floorPrice)
      : null;
    const estimatedFloor = floorBreakdown?.effectiveFloor ?? null;

    // Estimated profit: P * 0.85 - 5.06 - costBasis * 1.0875
    const costBasis = p.rule.costBasis;
    let estimatedProfit: number | null = null;
    let estimatedRoi:    number | null = null;
    if (costBasis != null && costBasis > 0) {
      const profit = p.recommendedPrice * 0.85 - 5.06 - costBasis * 1.0875;
      estimatedProfit = Math.round(profit * 100) / 100;
      estimatedRoi    = Math.round((profit / costBasis) * 1000) / 10; // one decimal
    }

    const dataAgeHours  = (Date.now() - new Date(p.createdAt).getTime()) / 3_600_000;
    const isSafeToSend  = !!p.sku && dataAgeHours < 48;

    const riskFactors = computeRiskFactors({
      direction:        p.direction,
      previousPrice:    p.previousPrice,
      recommendedPrice: p.recommendedPrice,
      estimatedFloor,
      buyBoxPrice:      p.buyBoxPrice,
      dataAgeHours,
      hasCostBasis:     costBasis != null && costBasis > 0,
      riskScore:        p.riskScore,
      reason:           p.reason ?? null,
    });

    return {
      id:               p.id,
      asin:             p.rule.asin,
      title:            p.rule.title,
      previousPrice:    p.previousPrice,
      recommendedPrice: p.recommendedPrice,
      direction:        p.direction,
      riskScore:        p.riskScore,
      sku:              p.sku,
      buyBoxPrice:      p.buyBoxPrice,
      reason:           p.reason ?? null,
      strategy:         p.rule.strategy,
      estimatedFloor,
      costBasis,
      estimatedProfit,
      estimatedRoi,
      dataAgeHours,
      isSafeToSend,
      riskFactors,
    };
  });

  // ── Rules with readiness ────────────────────────────────────────────────────
  const rulesWithReadiness: RuleWithReadiness[] = rules.map((rule) => {
    const lastHistory     = rule.history?.[0];
    const hasCostOrFloor  = (rule.costBasis != null && rule.costBasis > 0) || ((rule.floorPrice ?? 0) > 0);
    const hasSku          = skuByAsin.has(rule.asin);
    const lastHistStat    = lastHistory?.status ?? null;

    const holdReason = lastHistStat === 'HOLD' && lastHistory && 'reason' in lastHistory
      ? (lastHistory.reason as string | null | undefined) ?? null
      : null;

    const inventorySku     = skuByAsin.get(rule.asin) ?? null;
    const inventoryUnitCost = unitCostByAsin.get(rule.asin) ?? null;
    const availableQuantity = qtyByAsin.has(rule.asin) ? (qtyByAsin.get(rule.asin) ?? 0) : null;
    const lastHistorySku    = lastHistory && 'sku' in lastHistory ? (lastHistory.sku as string | null | undefined) ?? null : null;

    const skuMismatch       = detectSkuMismatch(inventorySku, lastHistorySku);
    const costBasisMismatch = detectCostMismatch(rule.costBasis, inventoryUnitCost);

    return {
      ...rule,
      sku: inventorySku,
      readiness: computeRepricingReadiness({
        isActive:           rule.isActive,
        hasCostOrFloor,
        hasSku,
        hasPendingProposal: pendingRuleIds.has(rule.id),
        lastRepricedAt:     rule.lastRepricedAt,
        lastHistoryStatus:  lastHistStat,
      }),
      health: computeHealthScore({
        hasCostOrFloor,
        hasSku,
        lastRepricedAt:    rule.lastRepricedAt,
        lastHistoryStatus: lastHistStat,
        minRoi:            rule.minRoi,
        minProfit:         rule.minProfit,
      }),
      holdReason,
      skuMismatch,
      costBasisMismatch,
      availableQuantity,
      inventoryUnitCost,
    };
  });

  const needsAttention = rulesWithReadiness.filter(
    (r) => r.readiness.severity === 'warning' || r.readiness.severity === 'error',
  );
  const activeRules   = rulesWithReadiness.filter((r) => r.isActive);
  const inactiveRules = rulesWithReadiness.filter((r) => !r.isActive);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Repricing</h1>
          <p className="page-subtitle">{activeRules.length} active · {inactiveRules.length} paused</p>
        </div>
        <RunAllButton />
      </div>

      {/* Quick guide */}
      <RepricingGuide />

      {/* ── Needs Attention ───────────────────────────────────────────────── */}
      {needsAttention.length > 0 && (
        <div className="card overflow-hidden border-amber-500/20">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h2 className="font-semibold text-slate-50">Needs Attention</h2>
            <span className="badge bg-amber-500/15 text-amber-400 text-xs">{needsAttention.length}</span>
          </div>
          <div className="divide-y divide-slate-800">
            {needsAttention.map((rule) => (
              <div key={rule.id} className="flex items-center gap-4 px-5 py-3">
                <ReadinessBadge readiness={rule.readiness} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-100 truncate">{rule.title ?? rule.asin}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{rule.readiness.action}</div>
                </div>
                <div className="flex items-center gap-0.5">
                  <EditRuleModal rule={rule} readiness={rule.readiness} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Price Proposals ───────────────────────────────────────────────── */}
      <ProposalsPanel proposals={proposals} />

      {/* ── Active Rules ──────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
          <h2 className="font-semibold text-slate-50">Active Rules</h2>
          <span className="badge bg-slate-700 text-slate-300 text-xs">{activeRules.length}</span>
        </div>
        <RulesTable rules={activeRules} />
      </div>

      {/* ── Paused Rules ──────────────────────────────────────────────────── */}
      {inactiveRules.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
            <h2 className="font-semibold text-slate-50">Paused Rules</h2>
            <span className="badge bg-slate-700 text-slate-400 text-xs">{inactiveRules.length}</span>
          </div>
          <RulesTable rules={inactiveRules} />
        </div>
      )}

      {/* ── Recent Activity ───────────────────────────────────────────────── */}
      {history.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="font-semibold text-slate-50">Recent Activity</h2>
          </div>
          <div className="divide-y divide-slate-800">
            {history.map((h) => {
              const dir = h.direction as 'UP' | 'DOWN' | 'HOLD';
              const { icon: DirIcon, cls } = DIRECTION_ICON[dir];
              const badge = STATUS_BADGE[h.status] ?? STATUS_BADGE.REJECTED;
              return (
                <div key={h.id} className="flex items-center gap-4 px-5 py-3">
                  <DirIcon className={`w-4 h-4 ${cls} flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-100 truncate">{h.rule.title ?? h.rule.asin}</div>
                    <div className="text-xs text-slate-500">{h.rule.asin}</div>
                  </div>
                  <span className={`badge text-xs ${badge.cls}`} title={h.pushError ?? undefined}>{badge.label}</span>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-50">{formatCurrency(h.recommendedPrice)}</div>
                    <div className="text-xs text-slate-500">Risk {h.riskScore.toFixed(0)}</div>
                  </div>
                  <div className="text-xs text-slate-500 w-24 text-right">
                    {new Date(h.pushedAt ?? h.createdAt).toLocaleDateString()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
