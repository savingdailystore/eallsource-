import { NextResponse } from 'next/server';
import { prisma } from '@lib/prisma';

export async function GET() {
  try {
    const batches = await prisma.weeklyBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: {
        _count: { select: { products: true } },
      },
    });
    return NextResponse.json({ success: true, data: batches });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
