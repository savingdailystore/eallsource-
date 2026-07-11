import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isPlatformAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';

const STALE_MINUTES = 10;

export async function POST() {
  const session = await auth();
  if (!session || !isPlatformAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000);

  const { count } = await prisma.scanJob.updateMany({
    where: {
      status: { in: ['PENDING', 'RUNNING'] },
      createdAt: { lt: cutoff },
    },
    data: {
      status:      'FAILED',
      error:       'Marked failed by platform admin after becoming stale.',
      completedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId:    session.user.orgId,
      action:   'ADMIN_MARK_STALE_SCANS_FAILED',
      resource: 'ScanJob',
      metadata: {
        adminEmail:    session.user.email,
        affected:      count,
        cutoffMinutes: STALE_MINUTES,
      },
    },
  });

  return NextResponse.json({ affected: count });
}
