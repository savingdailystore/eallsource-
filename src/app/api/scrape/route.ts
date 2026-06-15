import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { enqueueScrapeJob } from '@/jobs/queue';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { query?: string; maxResults?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const query = (body.query ?? '').trim();
  if (!query) return NextResponse.json({ error: 'query is required' }, { status: 400 });

  const job = await prisma.scrapeJob.create({
    data: {
      type: 'AMAZON_SEARCH',
      query,
      status: 'PENDING',
    },
  });

  await enqueueScrapeJob({ query, scrapeJobId: job.id, maxResults: body.maxResults ?? 20 });

  return NextResponse.json({ jobId: job.id, status: 'queued', query });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const jobs = await prisma.scrapeJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true, type: true, query: true, status: true,
      itemsFound: true, leadsCreated: true, error: true,
      startedAt: true, completedAt: true, createdAt: true,
    },
  });

  return NextResponse.json({ jobs });
}
