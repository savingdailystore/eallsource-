import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@lib/prisma';
import { getWeekNumber } from '@lib/utils';

export async function POST(req: NextRequest) {
  try {
  const session = await auth();
  const user = session?.user as { id: string; role: string } | undefined;

  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 });
  }

  const { week, year } = getWeekNumber();

  const batch = await prisma.weeklyBatch.upsert({
    where: { weekNumber_year: { weekNumber: week, year } },
    create: { weekNumber: week, year, status: 'RUNNING' },
    update: { status: 'RUNNING' },
  });

  // Trigger async scan (in production use BullMQ)
  void (async () => {
    try {
      const { runWeeklyFeed } = await import('@server/services/scanner/weekly-feed');
      const result = await runWeeklyFeed(batch.id);

      await prisma.weeklyBatch.update({
        where: { id: batch.id },
        data: {
          status: 'COMPLETED',
          totalFound: result.processed,
          totalPassed: result.passed,
          completedAt: new Date(),
        },
      });

      await prisma.scanLog.create({
        data: {
          retailer: 'ALL',
          status: 'COMPLETED',
          productsFound: result.processed,
          productsPassed: result.passed,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      await prisma.weeklyBatch.update({
        where: { id: batch.id },
        data: { status: 'FAILED' },
      });
    }
  })();

  return NextResponse.json({
    success: true,
    data: { batchId: batch.id, message: 'Scan started' },
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await auth();
    const user = session?.user as { id: string; role: string } | undefined;

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 });
    }

    const [batches, logs] = await Promise.all([
      prisma.weeklyBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.scanLog.findMany({ orderBy: { startedAt: 'desc' }, take: 50 }),
    ]);

    return NextResponse.json({ success: true, data: { batches, logs } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
