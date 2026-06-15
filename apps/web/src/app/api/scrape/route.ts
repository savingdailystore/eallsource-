import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@lib/prisma';
import { enqueueScrapeJob } from '@lib/queue';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { url?: string; query?: string; maxResults?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const url = (body.url ?? body.query ?? '').trim();
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  const job = await prisma.scrapeJob.create({
    data: { type: 'AMAZON_SEARCH', url, status: 'PENDING' },
  });

  await enqueueScrapeJob({ url, scrapeJobId: job.id, maxResults: body.maxResults ?? 20 });

  return NextResponse.json({ jobId: job.id, status: 'queued', url });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const jobs = await prisma.scrapeJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, type: true, url: true, status: true, createdAt: true },
  });

  return NextResponse.json({ jobs });
}
