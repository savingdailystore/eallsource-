import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const saved = await prisma.savedProduct.findMany({
      where: { userId },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const body = await req.json();
    const { productId, notes, tags } = body;

    if (!productId) {
      return NextResponse.json({ success: false, error: 'productId required' }, { status: 400 });
    }

    const saved = await prisma.savedProduct.upsert({
      where: { userId_productId: { userId, productId } },
      update: { notes, tags: tags ?? [] },
      create: { userId, productId, notes, tags: tags ?? [] },
    });

    return NextResponse.json({ success: true, data: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { searchParams } = req.nextUrl;
    const productId = searchParams.get('productId');

    if (!productId) {
      return NextResponse.json({ success: false, error: 'productId required' }, { status: 400 });
    }

    await prisma.savedProduct.delete({
      where: { userId_productId: { userId, productId } },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const body = await req.json();
    const { productId, notes, tags, isPurchased, purchaseDate, purchaseQty } = body;

    const updated = await prisma.savedProduct.update({
      where: { userId_productId: { userId, productId } },
      data: {
        ...(notes !== undefined && { notes }),
        ...(tags !== undefined && { tags }),
        ...(isPurchased !== undefined && { isPurchased }),
        ...(purchaseDate !== undefined && { purchaseDate: new Date(purchaseDate) }),
        ...(purchaseQty !== undefined && { purchaseQty }),
      },
      include: { product: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
