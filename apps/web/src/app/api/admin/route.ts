import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const resource = searchParams.get('resource');

    if (resource === 'users') {
      const users = await prisma.user.findMany({
        select: { id: true, email: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json({ success: true, data: users });
    }

    if (resource === 'metrics') {
      const [totalProducts, totalUsers, totalLeads, avgAgg] = await Promise.all([
        prisma.product.count(),
        prisma.user.count(),
        prisma.lead.count(),
        prisma.product.aggregate({ _avg: { roi: true, profit: true } }),
      ]);
      return NextResponse.json({
        success: true,
        data: {
          totalProducts,
          totalUsers,
          totalLeads,
          averageRoi: avgAgg._avg.roi ?? 0,
          averageProfit: avgAgg._avg.profit ?? 0,
        },
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid resource' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH() {
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 });
}
