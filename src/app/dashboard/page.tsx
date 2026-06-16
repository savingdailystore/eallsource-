import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatCurrency, formatPercent, relativeTime } from '@/lib/utils';
import { scoreLabel } from '@/engines/scoring';
import {
  TrendingUp, Package, DollarSign, BarChart3,
  ArrowUpRight, Flame, CheckCircle2, Clock,
} from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const session = await auth();
  const orgId   = session!.user.orgId;

  const [leadStats, topLeads, recentJobs, inventoryStats] = await Promise.all([
    prisma.$queryRaw<{ total: bigint; avg_roi: number; avg_score: number; new_today: bigint }[]>`
      SELECT
        COUNT(*) as total,
        AVG(l.score)::float as avg_score,
        AVG(p.roi)::float as avg_roi,
        SUM(CASE WHEN l."createdAt" >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END) as new_today
      FROM leads l
      JOIN products p ON p.id = l."productId"
      WHERE l."orgId" = ${orgId}
        AND l.status != 'REJECTED'
        AND l.status != 'EXPIRED'
    `,
    prisma.lead.findMany({
      where: { orgId, status: { in: ['NEW', 'SAVED'] } },
      orderBy: { score: 'desc' },
      take: 5,
      include: { product: { select: { title: true, asin: true, roi: true, profit: true, score: true, sourceRetailer: true, finalCost: true, lowestFbaPrice: true, ipRiskScore: true } } },
    }),
    prisma.scanJob.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.inventoryItem.aggregate({
      where: { orgId },
      _count: { id: true },
      _sum: { costBasis: true, estimatedProfit: true },
    }),
  ]);

  const stats          = leadStats[0] ?? { total: 0n, avg_roi: 0, avg_score: 0, new_today: 0n };
  const inventoryValue  = inventoryStats._sum.costBasis ?? 0;
  const inventoryProfit = inventoryStats._sum.estimatedProfit ?? 0;

  const STAT_CARDS = [
    {
      label: 'Active Leads',
      value: Number(stats.total).toLocaleString(),
      sub:   `+${Number(stats.new_today)} today`,
      icon:  TrendingUp,
      color: 'text-orange-400',
      bg:    'bg-orange-500/10',
    },
    {
      label: 'Avg ROI',
      value: formatPercent(stats.avg_roi ?? 0),
      sub:   'Across active leads',
      icon:  BarChart3,
      color: 'text-blue-400',
      bg:    'bg-blue-500/10',
    },
    {
      label: 'Inventory Value',
      value: formatCurrency(inventoryValue),
      sub:   `${inventoryStats._count.id} items`,
      icon:  Package,
      color: 'text-purple-400',
      bg:    'bg-purple-500/10',
    },
    {
      label: 'Est. Inventory Profit',
      value: formatCurrency(inventoryProfit),
      sub:   'Based on current prices',
      icon:  DollarSign,
      color: 'text-emerald-400',
      bg:    'bg-emerald-500/10',
    },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back — here's what's happening today.</p>
        </div>
        <Link href="/dashboard/leads" className="btn-primary">
          <TrendingUp className="w-4 h-4" />
          View lead feed
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((s) => (
          <div key={s.label} className="card p-5">
            <div className="flex items-start justify-between">
              <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <ArrowUpRight className="w-4 h-4" style={{ color: '#3a3a3a' }} />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-semibold" style={{ color: '#f9fafb' }}>{s.value}</div>
              <div className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{s.label}</div>
              <div className="text-xs mt-1" style={{ color: '#6b7280' }}>{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Top Leads */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '0.5px solid #2a2a2a' }}>
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400" />
              <h2 className="font-semibold" style={{ color: '#f9fafb' }}>Top leads</h2>
            </div>
            <Link href="/dashboard/leads" className="text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors">
              View all →
            </Link>
          </div>

          {topLeads.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: '#6b7280' }}>
              No leads yet — run a scan to get started.
            </div>
          ) : (
            <div className="divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
              {topLeads.map((lead) => {
                const { label, color } = scoreLabel(lead.score);
                return (
                  <Link
                    key={lead.id}
                    href={`/dashboard/leads/${lead.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[#1c1c1c]"
                    style={{ borderBottomColor: '#2a2a2a' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: '#f9fafb' }}>
                        {lead.product.title}
                      </div>
                      <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: '#6b7280' }}>
                        <span className="font-mono">{lead.product.asin}</span>
                        {lead.product.sourceRetailer && (
                          <>
                            <span style={{ color: '#3a3a3a' }}>·</span>
                            <span>{lead.product.sourceRetailer}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-green-400">{formatCurrency(lead.product.profit)}</div>
                      <div className="text-xs" style={{ color: '#6b7280' }}>{formatPercent(lead.product.roi)} ROI</div>
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

        {/* Recent Jobs */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '0.5px solid #2a2a2a' }}>
            <Clock className="w-4 h-4" style={{ color: '#6b7280' }} />
            <h2 className="font-semibold" style={{ color: '#f9fafb' }}>Recent jobs</h2>
          </div>

          {recentJobs.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: '#6b7280' }}>No jobs run yet.</div>
          ) : (
            <div>
              {recentJobs.map((job, i) => (
                <div
                  key={job.id}
                  className="px-5 py-3"
                  style={{ borderBottom: i < recentJobs.length - 1 ? '0.5px solid #2a2a2a' : 'none' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize" style={{ color: '#f9fafb' }}>
                      {job.type.toLowerCase()}
                    </span>
                    <span className={`badge text-xs ${
                      job.status === 'DONE'    ? 'bg-green-500/10 text-green-400' :
                      job.status === 'FAILED'  ? 'bg-red-500/10 text-red-400' :
                      job.status === 'RUNNING' ? 'bg-blue-500/10 text-blue-400' :
                      'text-[#9ca3af]'
                    }`} style={job.status === 'PENDING' ? { background: '#2a2a2a' } : {}}>
                      {job.status === 'DONE' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                      {job.status}
                    </span>
                  </div>
                  {job.retailer && (
                    <div className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{job.retailer}</div>
                  )}
                  <div className="text-xs mt-1" style={{ color: '#6b7280' }}>{relativeTime(job.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
