import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { enqueueScrape } from '@/lib/queue';
import { getRetailerNames } from '@/retailers';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const startSchema = z.object({
  retailer: z.string(),
  query:    z.string().optional(),
  category: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body   = await req.json();
  const parsed = startSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { retailer, query, category } = parsed.data;
  const orgId = session.user.orgId;

  // Validate retailer
  if (!getRetailerNames().includes(retailer)) {
    return NextResponse.json({ error: `Unknown retailer: ${retailer}` }, { status: 400 });
  }

  // Create job record
  const job = await prisma.scanJob.create({
    data: { orgId, type: 'SCRAPE', retailer, status: 'PENDING' },
  });

  // Enqueue
  await enqueueScrape({ retailer, orgId, scanJobId: job.id });

  await prisma.auditLog.create({
    data: {
      orgId,
      userId: session.user.id,
      action: 'SCAN_STARTED',
      resource: 'scan_job',
      metadata: { jobId: job.id, retailer, query, category },
    },
  });

  return NextResponse.json({ success: true, data: job });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = session.user.orgId;
  const jobs  = await prisma.scanJob.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return NextResponse.json({ success: true, data: jobs, retailers: getRetailerNames() });
}
