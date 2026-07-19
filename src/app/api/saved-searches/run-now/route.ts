import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { runScanJob } from '@/services/run-scan';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Stop launching new searches with enough headroom for the in-flight search to
// finish within the 300s function limit.
const TIME_BUDGET_MS = 150_000;

// Owner-triggered on-demand run of this org's enabled saved searches. Writes
// scan results to the source pool only. Customer lead delivery is handled
// exclusively by /api/cron/weekly-lead-drop (Monday 13:00 UTC).
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const orgId = session.user.orgId;

  const org = await prisma.organization.findUnique({
    where:  { id: orgId },
    select: { scanEnabled: true },
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
    failures: 0,
    ranSearches:     [] as string[],
    skippedSearches: [] as string[],
    filtered: { noMatch: 0, noPricing: 0, notProfitable: 0, demandTooLow: 0, velocityTooLow: 0, noBuyBox: 0, priceDeclining: 0, priceTooLow: 0, validationFailed: 0 },
  };

  for (const search of searches) {
    if (Date.now() - start > TIME_BUDGET_MS) {
      summary.skippedForTime++;
      summary.skippedSearches.push(search.query);
      continue;
    }

    const job = await prisma.scanJob.create({
      data: { orgId, type: 'MANUAL_SCHEDULED_RUN', retailer: search.retailer, query: search.query, status: 'PENDING' },
    });

    try {
      const result = await runScanJob({ retailer: search.retailer, query: search.query, orgId, scanJobId: job.id });
      summary.ran++;
      summary.ranSearches.push(search.query);
      summary.productsFound += result.found;
      summary.leadsCreated  += result.created;
      summary.leadsUpdated  += result.updated;
      summary.filtered.noMatch          += result.noMatch;
      summary.filtered.noPricing        += result.noPricing;
      summary.filtered.notProfitable    += result.notProfitable;
      summary.filtered.demandTooLow     += result.demandTooLow;
      summary.filtered.velocityTooLow   += result.velocityTooLow;
      summary.filtered.noBuyBox         += result.noBuyBox;
      summary.filtered.priceDeclining   += result.priceDeclining;
      summary.filtered.priceTooLow      += result.priceTooLow;
      summary.filtered.validationFailed += result.validationFailed;
      await prisma.savedSearch.update({ where: { id: search.id }, data: { lastRunAt: new Date(), lastResult: result as object } });
    } catch (err) {
      summary.failures++;
      await prisma.savedSearch.update({ where: { id: search.id }, data: { lastRunAt: new Date(), lastResult: { error: String(err) } } }).catch(() => {});
    }
  }

  return NextResponse.json({
    ok: true,
    elapsedMs: Date.now() - start,
    ...summary,
    message: 'Leads added to source pool. Customer delivery happens on the next weekly lead drop (Monday 6:00 AM Arizona time).',
  });
}
