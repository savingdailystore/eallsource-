import { prisma } from '@/lib/prisma';
import { Users, Package, Bookmark, TrendingUp, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/utils';

async function getAdminMetrics() {
  const [
    totalProducts,
    totalUsers,
    totalSaved,
    latestBatch,
    avgAgg,
    categories,
    retailers,
    scanLogs,
  ] = await Promise.all([
    prisma.product.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count(),
    prisma.savedProduct.count(),
    prisma.weeklyBatch.findFirst({ orderBy: { createdAt: 'desc' } }),
    prisma.product.aggregate({ _avg: { roi: true, netProfit: true }, where: { status: 'ACTIVE' } }),
    prisma.product.groupBy({ by: ['category'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 5 }),
    prisma.product.groupBy({ by: ['sourceRetailer'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 5 }),
    prisma.scanLog.findMany({ orderBy: { startedAt: 'desc' }, take: 5 }),
  ]);

  return { totalProducts, totalUsers, totalSaved, latestBatch, avgAgg, categories, retailers, scanLogs };
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
        <div className="flex items-center gap-2">
          <Link href="/admin/scans" className="flex items-center gap-2 text-sm bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700 transition-colors font-medium">
            Run Scan
          </Link>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Products', value: formatNumber(data.totalProducts), icon: Package, color: 'green' },
          { label: 'Total Users', value: formatNumber(data.totalUsers), icon: Users, color: 'blue' },
          { label: 'Saved Products', value: formatNumber(data.totalSaved), icon: Bookmark, color: 'purple' },
          { label: 'Avg ROI', value: formatPercent(data.avgAgg._avg.roi ?? 0), icon: TrendingUp, color: 'orange' },
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

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Top categories */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 text-sm">Top Categories</h3>
            <Link href="/admin/scans" className="text-xs text-green-600 flex items-center gap-1">Manage <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <div className="space-y-3">
            {data.categories.map((c) => (
              <div key={c.category} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{c.category}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${Math.min(100, (c._count.id / (data.totalProducts || 1)) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-8 text-right">{c._count.id}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top retailers */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 text-sm mb-4">Source Retailers</h3>
          <div className="space-y-3">
            {data.retailers.map((r) => (
              <div key={r.sourceRetailer} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{r.sourceRetailer}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.min(100, (r._count.id / (data.totalProducts || 1)) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-8 text-right">{r._count.id}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Latest batch */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 text-sm mb-4">Latest Weekly Batch</h3>
          {data.latestBatch ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Week</span>
                <span className="font-medium text-gray-900">W{data.latestBatch.weekNumber} / {data.latestBatch.year}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Status</span>
                <span className={`font-medium ${data.latestBatch.status === 'COMPLETED' ? 'text-green-600' : 'text-blue-600'}`}>
                  {data.latestBatch.status}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Scanned</span>
                <span className="font-medium text-gray-900">{data.latestBatch.totalFound}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Qualified</span>
                <span className="font-bold text-green-600">{data.latestBatch.totalPassed}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Pass Rate</span>
                <span className="font-medium text-gray-900">
                  {data.latestBatch.totalFound > 0
                    ? `${((data.latestBatch.totalPassed / data.latestBatch.totalFound) * 100).toFixed(0)}%`
                    : '—'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No batches yet. Run a scan to populate the feed.</p>
          )}
          <Link
            href="/admin/scans"
            className="mt-4 flex items-center justify-center gap-1.5 text-sm text-green-600 font-medium border border-green-200 rounded-xl py-2 hover:bg-green-50 transition-colors"
          >
            Manage scans <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
