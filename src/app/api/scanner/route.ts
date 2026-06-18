import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { runScanJob } from '@/services/run-scan';
import { getRetailerNames } from '@/retailers';
import { runDemoScan } from '@/lib/demo-scan';
import { z } from 'zod';

export const dynamic    = 'force-dynamic';
export const maxDuration = 300;

const startSchema = z.object({
  retailer: z.string(),
  query:    z.string().optional(),
  category: z.string().optional(),
  demo:     z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Only the organization owner can run scans.' }, { status: 403 });
  }

  const body   = await req.json();
  const parsed = startSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { retailer, query, category, demo } = parsed.data;
  const orgId = session.user.orgId;

  // Validate retailer
  if (!getRetailerNames().includes(retailer)) {
    return NextResponse.json({ error: `Unknown retailer: ${retailer}` }, { status: 400 });
  }

  // Create job record
  const job = await prisma.scanJob.create({
    data: { orgId, type: demo ? 'DEMO_SCRAPE' : 'SCRAPE', retailer, query: query ?? '', status: 'PENDING' },
  });

  // Demo mode: run synchronously with generated sample data — no Apify/worker.
  if (demo) {
    try {
      const count = await runDemoScan(orgId, retailer, query);
      const done  = await prisma.scanJob.update({
        where: { id: job.id },
        data:  { status: 'DONE', startedAt: new Date(), completedAt: new Date(), result: { count, demo: true } },
      });
      return NextResponse.json({ success: true, data: done, demo: true, count });
    } catch (err: any) {
      await prisma.scanJob.update({
        where: { id: job.id },
        data:  { status: 'FAILED', error: err?.message ?? 'Demo scan failed' },
      });
      return NextResponse.json({ error: 'Demo scan failed' }, { status: 500 });
    }
  }

  await prisma.auditLog.create({
    data: {
      orgId,
      userId: session.user.id,
      action: 'SCAN_STARTED',
      resource: 'scan_job',
      metadata: { jobId: job.id, retailer, query, category },
    },
  });

  // Run synchronously — this deployment has no always-on worker. runScanJob
  // does scrape → match → price → lead and records the result on the ScanJob.
  try {
    const result = await runScanJob({ retailer, query: query ?? '', orgId, scanJobId: job.id });
    return NextResponse.json({ success: true, data: job, result });
  } catch (err) {
    return NextResponse.json({ error: 'Scan failed', message: String(err) }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const orgId = session.user.orgId;
  const jobs  = await prisma.scanJob.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return NextResponse.json({ success: true, data: jobs, retailers: getRetailerNames() });
}
