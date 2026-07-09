import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { TrendingUp, Download } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Lead Feed' };

interface SearchParams { page?: string; status?: string; minRoi?: string; sortBy?: string; gating?: string; }

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth();
  const orgId   = session!.user.orgId;
  const sp      = await searchParams;

  const page     = Number(sp.page ?? 1);
  const pageSize = 25;
  const status   = sp.status;
  const minRoi   = sp.minRoi ? Number(sp.minRoi) : undefined;
  const sortBy   = sp.sortBy ?? 'score';
  const gating   = sp.gating; // 'sellable' = hide restricted + approval-needed

  const hasFilters = gating === 'sellable' || !!status || minRoi != null;

  // Build the product filter in one place so multiple conditions compose
  // (previously a second `product:` key silently clobbered the minRoi filter).
  const productWhere: any = { validationPassed: true };
  if (minRoi != null) productWhere.roi = { gte: minRoi };
  if (gating === 'sellable') {
    productWhere.isBrandRestricted = false;
    productWhere.isCategoryGated   = false;
    productWhere.hasHazmat         = false;
    productWhere.ipRiskScore       = { not: 'HIGH' };
  }

  const where = {
    orgId,
    ...(status ? { status: status as any } : { status: { notIn: ['REJECTED', 'EXPIRED'] as any[] } }),
    product: productWhere,
  };

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: sortBy === 'roi'    ? { product: { roi: 'desc' } }
             : sortBy === 'profit' ? { product: { profit: 'desc' } }
             : { score: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        product: {
          select: {
            id: true, asin: true, title: true, brand: true, category: true,
            imageUrl: true, sourceRetailer: true, sourcePrice: true,
            sourceListPrice: true, onSale: true,
            finalCost: true, lowestFbaPrice: true, buyBoxPrice: true,
            amazonFees: true, prepFee: true, taxAmount: true,
            profit: true, roi: true, margin: true,
            bsr: true, bsrPercentage: true,
            demandLevel: true, gatingRisk: true, ipRiskScore: true,
            autoUngated: true, isBrandRestricted: true, isCategoryGated: true, hasHazmat: true,
            amazonOwnsBuyBox: true, buyBoxOwner: true,
            matchConfidence: true, matchMethod: true, availableDiscounts: true, discountSources: true,
            keepaLink: true, amazonUrl: true, score: true,
            validationPassed: true, identityScore: true, urlScore: true,
            priceScore: true, inventoryScore: true,
          },
        },
      },
    }),
    prisma.lead.count({ where }),
  ]);

  return (
    <div className="p-6 lg:p-8 max-w-[1800px]">
      <div className="page-header mb-5">
        <div>
          <h1 className="page-title">Lead Feed</h1>
          <p className="page-subtitle">
            {total > 0
              ? `${total.toLocaleString()} qualified ${total === 1 ? 'opportunity' : 'opportunities'} · ranked by profit, ROI, demand, and match confidence`
              : 'Qualified opportunities ranked by profit, ROI, demand, and match confidence'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/api/export?type=leads&format=csv" className="btn-secondary text-xs">
            <Download className="w-3.5 h-3.5" />CSV
          </Link>
          <Link href="/api/export?type=leads&format=excel" className="btn-primary text-xs">
            <Download className="w-3.5 h-3.5" />Excel
          </Link>
        </div>
      </div>

      {/* Ungating filter */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-slate-500">Show:</span>
        <Link
          href="/dashboard/leads"
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${gating !== 'sellable' ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
        >
          All leads
        </Link>
        <Link
          href="/dashboard/leads?gating=sellable"
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${gating === 'sellable' ? 'bg-green-600 border-green-600 text-white' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
        >
          Sellable only
        </Link>
        <span className="text-xs text-slate-500 hidden sm:inline">— hides restricted brands, gated categories &amp; hazmat</span>
      </div>

      <LeadsTable
        leads={leads as any}
        total={total}
        page={page}
        pageSize={pageSize}
        orgPlan={session!.user.plan}
        isOwner={session!.user.role === 'OWNER'}
        hasFilters={hasFilters}
      />
    </div>
  );
}
