import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { scoreLead } from '@/services/scoring/engine';
import { assessIpRisk } from '@/services/ip-risk/engine';
import { prisma } from '@/lib/prisma';
import { enqueueScoreJob } from '@/jobs/queue';

export const dynamic = 'force-dynamic';

/** POST /api/scoring — score a single lead immediately (synchronous) */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { leadId?: string; batchRescore?: boolean };

  if (body.batchRescore) {
    // Queue all unscored leads
    const leads = await prisma.lead.findMany({ where: { score: 0 }, select: { id: true } });
    await Promise.all(leads.map((l) => enqueueScoreJob({ leadId: l.id })));
    return NextResponse.json({ queued: leads.length });
  }

  if (!body.leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

  const lead = await prisma.lead.findUnique({ where: { id: body.leadId } });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const ipRisk = assessIpRisk(lead.title);
  const result = scoreLead({
    roi: lead.roi,
    netProfit: lead.netProfit,
    bsr: lead.bsr ?? undefined,
    fbaSellers: lead.fbaSellers,
    amazonOwnsBB: lead.amazonOwnsBB,
    ipRisk: ipRisk.score,
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: { score: result.score, scoreBreakdown: result.breakdown },
  });

  return NextResponse.json({ score: result.score, tier: result.tier, breakdown: result.breakdown });
}
