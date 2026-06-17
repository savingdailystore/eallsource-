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
      _sum: { availableQuantity: true, totalQuantity: true },
    }),
  ]);

  const stats         = leadStats[0] ?? { total: 0n, avg_roi: 0, avg_score: 0, new_today: 0n };
  const totalUnits    = inventoryStats._sum.totalQuantity ?? 0;
  const availableUnits = inventoryStats._sum.availableQuantity ?? 0;

  const STAT_CARDS = [
    { label: 'Active Leads',     value: Number(stats.total).toLocaleString(), sub: `+${Number(stats.new_today)} today`,   icon: TrendingUp, color: 'text-blue-600',    bg: 'bg-blue-50',    href: '/dashboard/leads'     },
    { label: 'Avg ROI',          value: formatPercent(stats.avg_roi ?? 0),    sub: 'Across active leads',                 icon: BarChart3,  color: 'text-indigo-600',  bg: 'bg-indigo-50',  href: null                   },
    { label: 'Inventory SKUs',   value: inventoryStats._count.id.toLocaleString(), sub: `${availableUnits.toLocaleString()} available`, icon: Package, color: 'text-purple-600', bg: 'bg-purple-50', href: '/dashboard/inventory' },
    { label: 'Total Units',      value: totalUnits.toLocaleString(),          sub: 'Across all FBA inventory',            icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50', href: '/dashboard/inventory' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back — here&apos;s what&apos;s happening today.</p>
        </div>
        <Link href="/dashboard/leads" className="btn-primary">
          <TrendingUp className="w-4 h-4" />
          View lead feed
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((s) => {
          const inner = (
            <>
              <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <ArrowUpRight className={`w-4 h-4 ${s.href ? 'text-slate-400' : 'text-slate-200'}`} />
              </div>
              <div className="mt-3">
                <div className="text-2xl font-semibold text-slate-900">{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
                <div className="text-xs text-slate-400 mt-1">{s.sub}</div>
              </div>
            </>
          );
          return s.href ? (
            <Link key={s.label} href={s.href} className="card p-5 block hover:shadow-md hover:border-slate-200 transition-all">
              {inner}
            </Link>
          ) : (
            <div key={s.label} className="card p-5">{inner}</div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Top Leads */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-blue-500" />
              <h2 className="font-semibold text-slate-900">Top leads</h2>
            </div>
            <Link href="/dashboard/leads" className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors">
              View all →
            </Link>
          </div>

          {topLeads.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              No leads yet — run a scan to get started.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {topLeads.map((lead) => {
                const { label, color } = scoreLabel(lead.score);
                return (
                  <Link
                    key={lead.id}
                    href={`/dashboard/leads/${lead.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {lead.product.title}
                      </div>
                      <div className="text-xs mt-0.5 flex items-center gap-2 text-slate-500">
                        <span className="font-mono">{lead.product.asin}</span>
                        {lead.product.sourceRetailer && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span>{lead.product.sourceRetailer}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-green-600">{formatCurrency(lead.product.profit)}</div>
                      <div className="text-xs text-slate-500">{formatPercent(lead.product.roi)} ROI</div>
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
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
            <Clock className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-900">Recent jobs</h2>
          </div>

          {recentJobs.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">No jobs run yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentJobs.map((job) => (
                <div key={job.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-800 capitalize">
                      {job.type.toLowerCase()}
                    </span>
                    <span className={`badge text-xs ${
                      job.status === 'DONE'    ? 'bg-green-100 text-green-700' :
                      job.status === 'FAILED'  ? 'bg-red-100 text-red-600'    :
                      job.status === 'RUNNING' ? 'bg-blue-100 text-blue-700'  :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {job.status === 'DONE' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                      {job.status}
                    </span>
                  </div>
                  {job.retailer && (
                    <div className="text-xs mt-0.5 text-slate-500">{job.retailer}</div>
                  )}
                  <div className="text-xs mt-1 text-slate-400">{relativeTime(job.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
