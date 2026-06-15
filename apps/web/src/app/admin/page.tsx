import { prisma } from '@lib/prisma';
import { Users, Package, TrendingUp, Flame, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { formatNumber, formatPercent, formatCurrency } from '@lib/utils';

async function getAdminMetrics() {
  const [totalProducts, totalUsers, totalLeads, avgAgg, topProducts] = await Promise.all([
    prisma.product.count(),
    prisma.user.count(),
    prisma.lead.count(),
    prisma.product.aggregate({ _avg: { roi: true, profit: true } }),
    prisma.product.findMany({
      orderBy: { score: 'desc' },
      take: 5,
      select: { id: true, asin: true, title: true, roi: true, profit: true, score: true },
    }),
  ]);
  return { totalProducts, totalUsers, totalLeads, avgAgg, topProducts };
}

export default async function AdminDashboardPage() {
  const data = await getAdminMetrics();

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Platform overview and management</p>
        </div>
        <Link
          href="/admin/users"
          className="flex items-center gap-2 text-sm bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700 transition-colors font-medium"
        >
          Manage Users
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Products', value: formatNumber(data.totalProducts), icon: Package,   color: 'green' },
          { label: 'Total Users',    value: formatNumber(data.totalUsers),    icon: Users,     color: 'blue' },
          { label: 'Total Leads',    value: formatNumber(data.totalLeads),    icon: Flame,     color: 'orange' },
          { label: 'Avg ROI',        value: formatPercent(data.avgAgg._avg.roi ?? 0), icon: TrendingUp, color: 'purple' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 bg-${card.color}-50`}>
              <card.icon className={`w-5 h-5 text-${card.color}-600`} />
            </div>
            <div className="text-2xl font-bold text-gray-900">{card.value}</div>
            <div className="text-sm text-gray-400 mt-0.5">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 text-sm">Top Scoring Products</h3>
          <Link href="/dashboard/leads" className="text-xs text-green-600 flex items-center gap-1">
            View Leads <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-3">
          {data.topProducts.map((p) => (
            <div key={p.id} className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900 truncate max-w-[300px]">{p.title}</div>
                <div className="text-xs text-gray-400 font-mono">{p.asin}</div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs font-bold text-green-600">{formatPercent(p.roi)} ROI</span>
                <span className="text-xs text-gray-500">{formatCurrency(p.profit)} profit</span>
                <span className="text-xs font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                  Score {p.score.toFixed(0)}
                </span>
              </div>
            </div>
          ))}
          {data.topProducts.length === 0 && (
            <p className="text-sm text-gray-400">No products yet. Run a scrape job to populate data.</p>
          )}
        </div>
      </div>
    </div>
  );
}
