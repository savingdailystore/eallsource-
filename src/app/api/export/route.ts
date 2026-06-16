import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const type   = sp.get('type') ?? 'leads';
  const format = sp.get('format') ?? 'csv';
  const orgId  = session.user.orgId;

  let rows: Record<string, unknown>[];

  if (type === 'leads') {
    const data = await prisma.lead.findMany({
      where: { orgId, status: { notIn: ['REJECTED', 'EXPIRED'] } },
      orderBy: { score: 'desc' },
      take: 1000,
      include: { product: true },
    });
    rows = data.map((l) => ({
      score: l.score,
      status: l.status,
      createdAt: l.createdAt.toISOString(),
      asin: l.product.asin,
      title: l.product.title,
      category: l.product.category,
      sourceRetailer: l.product.sourceRetailer,
      sourcePrice: l.product.sourcePrice,
      finalCost: l.product.finalCost,
      resellPrice: l.product.lowestFbaPrice ?? l.product.price,
      amazonFees: l.product.amazonFees,
      profit: l.product.profit,
      roi: l.product.roi,
      bsr: l.product.bsr,
      ipRisk: l.product.ipRiskScore,
      demandLevel: l.product.demandLevel,
    }));
  } else {
    const data = await prisma.product.findMany({
      where: { orgId },
      orderBy: { score: 'desc' },
      take: 1000,
    });
    rows = data.map((p) => ({
      asin: p.asin, title: p.title, category: p.category,
      sourceRetailer: p.sourceRetailer, sourcePrice: p.sourcePrice,
      finalCost: p.finalCost, profit: p.profit, roi: p.roi, score: p.score,
      bsr: p.bsr, ipRisk: p.ipRiskScore, demandLevel: p.demandLevel,
    }));
  }

  if (format === 'csv') {
    if (!rows.length) {
      return new NextResponse('No data', { status: 200, headers: { 'Content-Type': 'text/csv' } });
    }
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map((r) =>
        headers.map((h) => {
          const val = r[h];
          const str = val == null ? '' : String(val);
          return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        }).join(','),
      ),
    ].join('\n');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json({ success: true, data: rows });
}
