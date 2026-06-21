import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/utils';
import { ArrowUp, ArrowDown, Minus, Zap } from 'lucide-react';
import { RunAllButton } from '@/components/repricing/RunAllButton';
import { EditRuleModal } from '@/components/repricing/EditRuleModal';
import { DeleteRuleButton } from '@/components/repricing/DeleteRuleButton';
import { ToggleRuleButton } from '@/components/repricing/ToggleRuleButton';
import { ProposalsPanel } from '@/components/repricing/ProposalsPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Repricing' };

const DIRECTION_ICON = {
  UP:   { icon: ArrowUp,   cls: 'text-green-400' },
  DOWN: { icon: ArrowDown, cls: 'text-red-400' },
  HOLD: { icon: Minus,     cls: 'text-slate-500' },
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PUSHED:   { label: 'Pushed live',  cls: 'bg-green-500/15 text-green-400' },
  FAILED:   { label: 'Failed',       cls: 'bg-red-500/15 text-red-400' },
  REJECTED: { label: 'Dismissed',    cls: 'bg-slate-700 text-slate-400' },
};

function RulesTable({ rules }: { rules: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-800/40">
            {['ASIN', 'Product', 'Strategy', 'Min ROI', 'Min Profit', 'Cost', 'Floor', 'Last Price', 'Direction', 'Last Run', ''].map((h) => (
              <th key={h} className="table-th">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rules.map((rule) => {
            const last = rule.history?.[0];
            const dir = (last?.direction ?? rule.lastDirection ?? 'HOLD') as 'UP' | 'DOWN' | 'HOLD';
            const { icon: DirIcon, cls } = DIRECTION_ICON[dir];
            return (
              <tr key={rule.id} className={`hover:bg-slate-800/40 ${rule.isActive ? '' : 'opacity-60'}`}>
                <td className="table-td font-mono text-xs text-slate-400">{rule.asin}</td>
                <td className="table-td">
                  <div className="font-medium text-slate-50 max-w-xs truncate">{rule.title ?? '—'}</div>
                </td>
                <td className="table-td">
                  <span className="badge bg-slate-800 text-slate-300 text-xs">{rule.strategy}</span>
                </td>
                <td className="table-td">{rule.minRoi}%</td>
                <td className="table-td">{formatCurrency(rule.minProfit)}</td>
                <td className="table-td">
                  {rule.costBasis != null
                    ? formatCurrency(rule.costBasis)
                    : <span className="text-amber-400/80 text-xs" title="Set a unit cost so the repricer can protect your margin">Not set</span>}
                </td>
                <td className="table-td text-slate-300">{rule.floorPrice != null ? formatCurrency(rule.floorPrice) : '—'}</td>
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
                    <EditRuleModal rule={rule} />
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
            Automated repricing keeps you competitive while protecting your margins.
            Upgrade to Pro to unlock this feature.
          </p>
          <a href="/dashboard/billing" className="btn-primary">
            Upgrade to Pro →
          </a>
        </div>
      </div>
    );
  }

  const orgId = session!.user.orgId;
  const [rules, history, proposalRows] = await Promise.all([
    prisma.repricingRule.findMany({
      where: { orgId },
      orderBy: { updatedAt: 'desc' },
      include: { history: { orderBy: { createdAt: 'desc' }, take: 1 } },
    }),
    prisma.repricingHistory.findMany({
      where: { rule: { orgId }, status: { in: ['PUSHED', 'FAILED', 'REJECTED'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { rule: { select: { asin: true, title: true } } },
    }),
    prisma.repricingHistory.findMany({
      where: { rule: { orgId }, status: 'PROPOSED' },
      orderBy: { recommendedPrice: 'desc' },
      include: { rule: { select: { asin: true, title: true } } },
    }),
  ]);

  const proposals = proposalRows.map((p) => ({
    id:               p.id,
    asin:             p.rule.asin,
    title:            p.rule.title,
    previousPrice:    p.previousPrice,
    recommendedPrice: p.recommendedPrice,
    direction:        p.direction,
    riskScore:        p.riskScore,
    sku:              p.sku,
    buyBoxPrice:      p.buyBoxPrice,
  }));

  const activeRules   = rules.filter((r) => r.isActive);
  const inactiveRules = rules.filter((r) => !r.isActive);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Repricing</h1>
          <p className="page-subtitle">{activeRules.length} active · {inactiveRules.length} paused</p>
        </div>
        <RunAllButton />
      </div>

      {/* Pending price changes awaiting approval */}
      <ProposalsPanel proposals={proposals} />

      {/* Active rules */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-slate-50">Active Rules</h2>
        </div>
        {activeRules.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No active repricing rules. Add inventory items with a listed price, then click
            <span className="font-medium text-slate-300"> Run All Now</span> to generate and run rules.
          </div>
        ) : (
          <RulesTable rules={activeRules} />
        )}
      </div>

      {/* Inactive rules */}
      {inactiveRules.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
            <h2 className="font-semibold text-slate-50">Paused Rules</h2>
            <span className="badge bg-amber-500/15 text-amber-400 text-xs">{inactiveRules.length}</span>
          </div>
          <RulesTable rules={inactiveRules} />
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="font-semibold text-slate-50">Recent Reprice Activity</h2>
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
