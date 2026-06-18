import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runScanJob } from '@/services/run-scan';
import { broadcastLeads } from '@/services/broadcast';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel Pro: up to 300s per invocation

// Stop launching new searches after this much wall-clock time so an in-flight
// scrape can finish before the function is killed. Remaining searches run on
// the next cron tick (we order by lastRunAt so they get priority).
const TIME_BUDGET_MS = 270_000;

export async function GET(req: NextRequest) {
  // ── Auth: Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" ──────────
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();

  // Least-recently-run first so every search eventually runs even if we run
  // out of time budget on a given tick.
  const searches = await prisma.savedSearch.findMany({
    where:   { enabled: true, org: { scanEnabled: true } },
    orderBy: [{ lastRunAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
  });

  // Track lead IDs per source org so we can broadcast after all searches finish
  const broadcastQueue = new Map<string, string[]>();

  const summary = {
    totalEnabled: searches.length,
    ran:          0,
    skippedForTime: 0,
    leadsCreated: 0,
    leadsUpdated: 0,
    failures:     0,
    broadcast:    0,
    details:      [] as Array<{ id: string; retailer: string; query: string; status: string; result?: unknown; error?: string }>,
  };

  for (const search of searches) {
    if (Date.now() - start > TIME_BUDGET_MS) {
      summary.skippedForTime++;
      continue;
    }

    const job = await prisma.scanJob.create({
      data: { orgId: search.orgId, type: 'SCHEDULED_SCRAPE', retailer: search.retailer, query: search.query, status: 'PENDING' },
    });

    try {
      const result = await runScanJob({
        retailer:  search.retailer,
        query:     search.query,
        orgId:     search.orgId,
        scanJobId: job.id,
      });

      summary.ran++;
      summary.leadsCreated += result.created;
      summary.leadsUpdated += result.updated;
      summary.details.push({ id: search.id, retailer: search.retailer, query: search.query, status: 'done', result });

      // Accumulate lead IDs per org for broadcast step
      if (result.leadIds.length > 0) {
        const existing = broadcastQueue.get(search.orgId) ?? [];
        broadcastQueue.set(search.orgId, [...existing, ...result.leadIds]);
      }

      await prisma.savedSearch.update({
        where: { id: search.id },
        data:  { lastRunAt: new Date(), lastResult: result as object },
      });
    } catch (err) {
      summary.failures++;
      summary.details.push({ id: search.id, retailer: search.retailer, query: search.query, status: 'failed', error: String(err) });

      await prisma.savedSearch.update({
        where: { id: search.id },
        data:  { lastRunAt: new Date(), lastResult: { error: String(err) } },
      }).catch(() => {});
    }
  }

  // Broadcast leads from any source orgs that produced results
  if (broadcastQueue.size > 0) {
    const sourceOrgs = await prisma.organization.findMany({
      where:  { isBroadcastSource: true, id: { in: [...broadcastQueue.keys()] } },
      select: { id: true },
    });

    for (const { id: sourceOrgId } of sourceOrgs) {
      const leadIds = broadcastQueue.get(sourceOrgId) ?? [];
      if (leadIds.length > 0) {
        summary.broadcast += await broadcastLeads(sourceOrgId, leadIds).catch((err) => {
          console.error('[cron] broadcast failed:', err);
          return 0;
        });
      }
    }
  }

  return NextResponse.json({ ok: true, elapsedMs: Date.now() - start, ...summary });
}
