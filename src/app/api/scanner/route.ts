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

  // Check scan access
  if (!demo) {
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { scanEnabled: true } });
    if (!org?.scanEnabled) {
      return NextResponse.json({ error: 'Scan access is not enabled for your account. Contact the platform admin.' }, { status: 403 });
    }
  }

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
      // ScanJob.error is displayed verbatim to the org owner in ScannerPanel —
      // never store the raw exception there (see run-scan.ts for the same
      // pattern). Log full detail server-side, store a fixed safe message.
      console.error(`[scanner] demo scan failed for jobId=${job.id} orgId=${orgId}:`, err);
      await prisma.scanJob.update({
        where: { id: job.id },
        data:  { status: 'FAILED', error: 'Demo scan failed. Our team has been notified — try again later.' },
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
    console.error(`[scanner] scan job ${job.id} failed:`, err);
    return NextResponse.json({ error: 'Scan failed' }, { status: 502 });
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
