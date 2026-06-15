import { prisma } from '@lib/prisma';
import { auth } from '@/lib/auth';
import { MetricsCards } from '@/components/dashboard/MetricsCards';
import { BuyBoxChart, RetailerChart } from '@/components/dashboard/Charts';
import { LowStockChart } from '@/components/dashboard/LowStockChart';
import Link from 'next/link';
import { ArrowRight, CalendarDays, Package } from 'lucide-react';

async function getDashboardData(userId: string) {
  const [
    totalOpportunities,
    savedCount,
    latestBatch,
    avgAgg,
    retailers,
    buyBoxDist,
    recentProducts,
  ] = await Promise.all([
    prisma.product.count({ where: { status: 'ACTIVE', ipRiskScore: 'LOW' } }),
    prisma.savedProduct.count({ where: { userId } }),
    prisma.weeklyBatch.findFirst({ orderBy: { createdAt: 'desc' } }),
    prisma.product.aggregate({
      _avg: { roi: true, netProfit: true },
      where: { status: 'ACTIVE', ipRiskScore: 'LOW' },
    }),
    prisma.product.groupBy({
      by: ['sourceRetailer'],
      _count: { id: true },
      where: { status: 'ACTIVE' },
      orderBy: { _count: { id: 'desc' } },
      take: 8,
    }),
    prisma.product.groupBy({
      by: ['buyBoxOwner'],
      _count: { id: true },
      where: { status: 'ACTIVE' },
    }),
    prisma.product.findMany({
      where: { status: 'ACTIVE', ipRiskScore: 'LOW' },
      orderBy: { roi: 'desc' },
      take: 5,
    }),
  ]);

  return {
    totalOpportunities,
    averageRoi: avgAgg._avg.roi ?? 0,
    averageProfit: avgAgg._avg.netProfit ?? 0,
    savedProducts: savedCount,
    weeklyNewLeads: latestBatch?.totalPassed ?? 0,
    retailerDistribution: retailers.map((r) => ({ retailer: r.sourceRetailer, count: r._count.id })),
    buyBoxDistribution: buyBoxDist.map((b) => ({ owner: b.buyBoxOwner, count: b._count.id })),
    recentProducts,
    latestBatch,
  };
}

export default async function DashboardPage() {
  const session = await auth();
  const userId = (session!.user as { id: string }).id;
  const data = await getDashboardData(userId);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Your Amazon OA sourcing overview
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/weekly"
            className="flex items-center gap-2 text-sm text-gray-600 border border-gray-200 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <CalendarDays className="w-4 h-4" />
            Weekly Feed
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

      {/* Metrics */}
      <MetricsCards
        totalOpportunities={data.totalOpportunities}
        averageRoi={data.averageRoi}
        averageProfit={data.averageProfit}
        savedProducts={data.savedProducts}
        weeklyNewLeads={data.weeklyNewLeads}
      />

      {/* Charts */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <LowStockChart />
        <BuyBoxChart data={data.buyBoxDistribution} />
        <RetailerChart data={data.retailerDistribution} />
      </div>

      {/* Top Products */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold text-gray-900">Top ROI Opportunities</h3>
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
                {['Product', 'Retailer', 'Final Cost', 'Resell Price', 'Net Profit', 'ROI', 'BSR', 'Buy Box'].map((h) => (
                  <th key={h} className="text-left pb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider pr-4 last:pr-0">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.recentProducts.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-gray-900 text-sm leading-tight max-w-[200px] truncate">{p.name}</div>
                    <div className="text-xs text-gray-400 font-mono mt-0.5">{p.asin}</div>
                  </td>
                  <td className="py-3 pr-4 text-gray-600 text-xs">{p.sourceRetailer}</td>
                  <td className="py-3 pr-4 text-gray-900 font-medium">${p.finalCost.toFixed(2)}</td>
                  <td className="py-3 pr-4 text-gray-700">${p.estimatedResellPrice.toFixed(2)}</td>
                  <td className="py-3 pr-4">
                    <span className="font-bold text-green-600">${p.netProfit.toFixed(2)}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                      {p.roi.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-gray-600">{p.bsr?.toLocaleString() ?? '—'}</td>
                  <td className="py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      p.buyBoxOwner === 'AMAZON' ? 'bg-orange-100 text-orange-700'
                      : p.buyBoxOwner === 'FBA_SELLER' ? 'bg-green-100 text-green-700'
                      : 'bg-blue-100 text-blue-700'
                    }`}>
                      {p.buyBoxOwner.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Latest batch info */}
      {data.latestBatch && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CalendarDays className="w-5 h-5 text-green-600" />
            <div>
              <div className="font-medium text-green-800 text-sm">
                Week {data.latestBatch.weekNumber}, {data.latestBatch.year} — Feed Complete
              </div>
              <div className="text-xs text-green-600">
                {data.latestBatch.totalPassed} qualified products found from {data.latestBatch.totalFound} scanned
              </div>
            </div>
          </div>
          <Link href="/dashboard/weekly" className="text-xs font-medium text-green-700 hover:text-green-800 flex items-center gap-1">
            View report <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
