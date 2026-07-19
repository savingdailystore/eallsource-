import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { broadcastLeads } from '@/services/broadcast';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Dedicated weekly customer lead drop — Monday 13:00 UTC / 6:00 AM Arizona.
// This is the ONLY route that calls broadcastLeads(). It does not run scanners
// or touch Apify. Source leads must already be in the pool from source-scan runs.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();

  const sourceOrgs = await prisma.organization.findMany({
    where:  { isBroadcastSource: true },
    select: { id: true },
  });

  if (sourceOrgs.length === 0) {
    return NextResponse.json({ ok: true, elapsedMs: Date.now() - start, sourceOrgCount: 0, sourceLeadCount: 0, totalDelivered: 0 });
  }

  const summary = {
    sourceOrgCount:  sourceOrgs.length,
    sourceLeadCount: 0,
    totalDelivered:  0,
    perOrg: [] as Array<{ sourceOrgId: string; leadCount: number; delivered: number }>,
  };

  for (const { id: sourceOrgId } of sourceOrgs) {
    const sourceLeads = await prisma.lead.findMany({
      where:  { orgId: sourceOrgId, status: { notIn: ['REJECTED', 'EXPIRED'] } },
      select: { id: true },
    });

    const leadIds = sourceLeads.map(l => l.id);
    summary.sourceLeadCount += leadIds.length;

    let delivered = 0;
    if (leadIds.length > 0) {
      delivered = await broadcastLeads(sourceOrgId, leadIds).catch((err) => {
        console.error('[weekly-lead-drop] broadcast failed for org', sourceOrgId, err);
        return 0;
      });
    }

    summary.totalDelivered += delivered;
    summary.perOrg.push({ sourceOrgId, leadCount: leadIds.length, delivered });
  }

  return NextResponse.json({ ok: true, elapsedMs: Date.now() - start, ...summary });
}
