import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
  const session = await auth();
  const user = session?.user as { id: string; role: string } | undefined;

  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const resource = searchParams.get('resource');

  if (resource === 'users') {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        subscriptionPlan: true,
        createdAt: true,
        _count: { select: { savedProducts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, data: users });
  }

  if (resource === 'metrics') {
    const [
      totalProducts,
      totalUsers,
      totalSaved,
      latestBatch,
      avgRoi,
      categories,
      retailers,
      buyBoxDist,
    ] = await Promise.all([
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count(),
      prisma.savedProduct.count(),
      prisma.weeklyBatch.findFirst({ orderBy: { createdAt: 'desc' } }),
      prisma.product.aggregate({ _avg: { roi: true, netProfit: true }, where: { status: 'ACTIVE' } }),
      prisma.product.groupBy({ by: ['category'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 8 }),
      prisma.product.groupBy({ by: ['sourceRetailer'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 8 }),
      prisma.product.groupBy({ by: ['buyBoxOwner'], _count: { id: true } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        totalProducts,
        totalUsers,
        totalSaved,
        weeklyNewLeads: latestBatch?.totalPassed ?? 0,
        averageRoi: avgRoi._avg.roi ?? 0,
        averageProfit: avgRoi._avg.netProfit ?? 0,
        categoryDistribution: categories.map((c) => ({ category: c.category, count: c._count.id })),
        retailerDistribution: retailers.map((r) => ({ retailer: r.sourceRetailer, count: r._count.id })),
        buyBoxDistribution: buyBoxDist.map((b) => ({ owner: b.buyBoxOwner, count: b._count.id })),
      },
    });
  }

  if (resource === 'sources') {
    const sources = await prisma.retailerSource.findMany({ orderBy: { name: 'asc' } });
    return NextResponse.json({ success: true, data: sources });
  }

  return NextResponse.json({ success: false, error: 'Invalid resource' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
  const session = await auth();
  const user = session?.user as { id: string; role: string } | undefined;

  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { resource, id, data } = body;

  if (resource === 'user') {
    const updated = await prisma.user.update({
      where: { id },
      data: {
        role: data.role,
        subscriptionPlan: data.subscriptionPlan,
      },
    });
    return NextResponse.json({ success: true, data: updated });
  }

  if (resource === 'source') {
    const updated = await prisma.retailerSource.update({
      where: { id },
      data: { enabled: data.enabled },
    });
    return NextResponse.json({ success: true, data: updated });
  }

  return NextResponse.json({ success: false, error: 'Invalid resource' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
