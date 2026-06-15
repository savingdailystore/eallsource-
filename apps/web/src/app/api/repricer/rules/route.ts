import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@lib/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as { id: string }).id;
    const rules = await prisma.repricerRule.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ success: true, data: rules });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as { id: string }).id;
    const body = await req.json();
    const { asin, sku, productName, minPrice, maxPrice, strategy, targetMargin } = body;

    if (!sku || !asin || !productName || minPrice == null || maxPrice == null || !strategy) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }
    if (minPrice >= maxPrice) {
      return NextResponse.json({ success: false, error: 'Min price must be less than max price' }, { status: 400 });
    }

    const rule = await prisma.repricerRule.upsert({
      where: { userId_sku: { userId, sku } },
      update: { minPrice, maxPrice, strategy, targetMargin, enabled: true },
      create: { userId, asin, sku, productName, minPrice, maxPrice, strategy, targetMargin, enabled: true },
    });
    return NextResponse.json({ success: true, data: rule });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as { id: string }).id;
    const body = await req.json();
    const { id, ...data } = body;

    const rule = await prisma.repricerRule.update({
      where: { id },
      data: { ...data, userId },
    });
    return NextResponse.json({ success: true, data: rule });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as { id: string }).id;
    const { searchParams } = req.nextUrl;
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    await prisma.repricerRule.delete({ where: { id, userId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
