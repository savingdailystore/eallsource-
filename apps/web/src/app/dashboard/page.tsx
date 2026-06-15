import { prisma } from '@lib/prisma';
import { auth } from '@/lib/auth';
import { MetricsCards } from '@/components/dashboard/MetricsCards';
import { LowStockChart } from '@/components/dashboard/LowStockChart';
import Link from 'next/link';
import { ArrowRight, Flame, Package } from 'lucide-react';
import { formatCurrency, formatPercent } from '@lib/utils';

async function getDashboardData() {
  const [totalProducts, totalLeads, newLeads, avgAgg, recentProducts] = await Promise.all([
    prisma.product.count(),
    prisma.lead.count(),
    prisma.lead.count({ where: { status: 'NEW' } }),
    prisma.product.aggregate({ _avg: { roi: true, profit: true } }),
    prisma.product.findMany({
      orderBy: { roi: 'desc' },
      take: 5,
      select: { id: true, asin: true, title: true, price: true, profit: true, roi: true, score: true },
    }),
  ]);

  return {
    totalOpportunities: totalProducts,
    totalLeads,
    newLeads,
    averageRoi: avgAgg._avg.roi ?? 0,
    averageProfit: avgAgg._avg.profit ?? 0,
    recentProducts,
  };
}

export default async function DashboardPage() {
  await auth(); // verify session (middleware handles redirect)
  const data = await getDashboardData();

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px]">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Your Amazon OA sourcing overview</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/leads"
            className="flex items-center gap-2 text-sm text-gray-600 border border-gray-200 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Flame className="w-4 h-4" />
            Leads
          </Link>
          <Link
            href="/dashboard/products"
            className="flex items-center gap-2 text-sm bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700 transition-colors font-medium"
          >
            <Package className="w-4 h-4" />
            Browse Products
          </Link>
        </div>
      </div>

      <MetricsCards
        totalOpportunities={data.totalOpportunities}
        averageRoi={data.averageRoi}
        averageProfit={data.averageProfit}
        totalLeads={data.totalLeads}
        newLeads={data.newLeads}
      />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <LowStockChart />

        {/* Lead status breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-900 mb-1">Lead Pipeline</h3>
          <p className="text-sm text-gray-400 mb-5">Current status breakdown</p>
          <div className="space-y-3">
            {[
              { label: 'New',       color: 'bg-blue-500',   status: 'NEW' },
              { label: 'Reviewed',  color: 'bg-yellow-500', status: 'REVIEWED' },
              { label: 'Purchased', color: 'bg-green-500',  status: 'PURCHASED' },
              { label: 'Passed',    color: 'bg-gray-300',   status: 'PASSED' },
            ].map((s) => (
              <div key={s.status} className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${s.color} shrink-0`} />
                <span className="text-sm text-gray-600 flex-1">{s.label}</span>
                <span className="text-sm font-semibold text-gray-900">
                  {s.status === 'NEW' ? data.newLeads : '—'}
                </span>
              </div>
            ))}
          </div>
          <Link
            href="/dashboard/leads"
            className="mt-5 flex items-center justify-center gap-1.5 text-sm text-green-600 font-medium border border-green-200 rounded-xl py-2 hover:bg-green-50 transition-colors"
          >
            View all leads <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Quick stats */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-900 mb-1">At a Glance</h3>
          <p className="text-sm text-gray-400 mb-5">Platform summary</p>
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total Products</span>
              <span className="font-semibold text-gray-900">{data.totalOpportunities}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total Leads</span>
              <span className="font-semibold text-gray-900">{data.totalLeads}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Avg ROI</span>
              <span className="font-bold text-green-600">{formatPercent(data.averageRoi)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Avg Profit</span>
              <span className="font-bold text-green-600">{formatCurrency(data.averageProfit)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Products */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold text-gray-900">Top ROI Products</h3>
            <p className="text-sm text-gray-400 mt-0.5">Highest-returning products right now</p>
          </div>
          <Link
            href="/dashboard/products"
            className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700 font-medium"
          >
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Product', 'Price', 'Profit', 'ROI', 'Score'].map((h) => (
                  <th
                    key={h}
                    className="text-left pb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider pr-4 last:pr-0"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.recentProducts.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-gray-900 text-sm leading-tight max-w-[260px] truncate">
                      {p.title}
                    </div>
                    <div className="text-xs text-gray-400 font-mono mt-0.5">{p.asin}</div>
                  </td>
                  <td className="py-3 pr-4 text-gray-700">{formatCurrency(p.price)}</td>
                  <td className="py-3 pr-4">
                    <span className="font-bold text-green-600">{formatCurrency(p.profit)}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                      {p.roi.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3">
                    <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">
                      {p.score.toFixed(0)}
                    </span>
                  </td>
                </tr>
              ))}
              {data.recentProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-gray-400">
                    No products yet. Trigger a scrape job to populate data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
