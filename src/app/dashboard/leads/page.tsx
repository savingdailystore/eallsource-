import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { TrendingUp, Download } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Lead Feed' };

interface SearchParams { page?: string; status?: string; minRoi?: string; sortBy?: string; }

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth();
  const orgId   = session!.user.orgId;
  const sp      = await searchParams;

  const page     = Number(sp.page ?? 1);
  const pageSize = 25;
  const status   = sp.status;
  const minRoi   = sp.minRoi ? Number(sp.minRoi) : undefined;
  const sortBy   = sp.sortBy ?? 'score';

  const where = {
    orgId,
    ...(status ? { status: status as any } : { status: { notIn: ['REJECTED', 'EXPIRED'] as any[] } }),
    ...(minRoi != null ? { product: { roi: { gte: minRoi } } } : {}),
    product: { validationPassed: true },
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
            autoUngated: true, amazonOwnsBuyBox: true, buyBoxOwner: true,
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
            {total.toLocaleString()} qualified opportunities — 95%+ validation, 30%+ ROI, top-3% BSR
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

      <LeadsTable
        leads={leads as any}
        total={total}
        page={page}
        pageSize={pageSize}
        orgPlan={session!.user.plan}
      />
    </div>
  );
}
