import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { runScanJob } from '@/services/run-scan';
import { broadcastLeads } from '@/services/broadcast';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TIME_BUDGET_MS = 270_000;

// Owner-triggered on-demand run of this org's enabled saved searches. Mirrors
// the weekly cron but is auth-gated (not CRON_SECRET) and scoped to one org.
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const orgId = session.user.orgId;

  const org = await prisma.organization.findUnique({
    where:  { id: orgId },
    select: { scanEnabled: true, isBroadcastSource: true },
  });
  if (!org?.scanEnabled) {
    return NextResponse.json({ error: 'Scan access is not enabled for your account.' }, { status: 403 });
  }
  const start = Date.now();

  const searches = await prisma.savedSearch.findMany({
    where:   { orgId, enabled: true },
    orderBy: [{ lastRunAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
  });

  if (searches.length === 0) {
    return NextResponse.json({ ok: true, ran: 0, message: 'No enabled searches to run.' });
  }

  const summary = {
    ran: 0, skippedForTime: 0, productsFound: 0, leadsCreated: 0, leadsUpdated: 0,
    failures: 0, broadcast: 0,
    filtered: { noMatch: 0, notProfitable: 0, demandTooLow: 0, validationFailed: 0 },
  };

  const allLeadIds: string[] = [];

  for (const search of searches) {
    if (Date.now() - start > TIME_BUDGET_MS) { summary.skippedForTime++; continue; }

    const job = await prisma.scanJob.create({
      data: { orgId, type: 'MANUAL_SCHEDULED_RUN', retailer: search.retailer, query: search.query, status: 'PENDING' },
    });

    try {
      const result = await runScanJob({ retailer: search.retailer, query: search.query, orgId, scanJobId: job.id });
      summary.ran++;
      summary.productsFound += result.found;
      summary.leadsCreated  += result.created;
      summary.leadsUpdated  += result.updated;
      summary.filtered.noMatch          += result.noMatch;
      summary.filtered.notProfitable    += result.notProfitable;
      summary.filtered.demandTooLow     += result.demandTooLow;
      summary.filtered.validationFailed += result.validationFailed;
      allLeadIds.push(...result.leadIds);
      await prisma.savedSearch.update({ where: { id: search.id }, data: { lastRunAt: new Date(), lastResult: result as object } });
    } catch (err) {
      summary.failures++;
      await prisma.savedSearch.update({ where: { id: search.id }, data: { lastRunAt: new Date(), lastResult: { error: String(err) } } }).catch(() => {});
    }
  }

  // Broadcast qualifying leads to subscriber orgs if this is the source org
  if (org.isBroadcastSource && allLeadIds.length > 0) {
    summary.broadcast = await broadcastLeads(orgId, allLeadIds).catch((err) => {
      console.error('[run-now] broadcast failed:', err);
      return 0;
    });
  }

  return NextResponse.json({ ok: true, elapsedMs: Date.now() - start, ...summary });
}
