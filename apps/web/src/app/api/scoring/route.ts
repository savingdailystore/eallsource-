import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@lib/prisma';
import { enqueueScoreJob } from '@lib/queue';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { leadId?: string; batchRescore?: boolean };

  if (body.batchRescore) {
    const leads = await prisma.lead.findMany({ where: { score: 0 }, select: { id: true } });
    await Promise.all(leads.map((l) => enqueueScoreJob({ leadId: l.id })));
    return NextResponse.json({ queued: leads.length });
  }

  if (!body.leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

  const lead = await prisma.lead.findUnique({
    where: { id: body.leadId },
    include: { product: true },
  });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  // ROI-weighted score capped at 100
  const roiPoints = Math.min(60, Math.max(0, lead.product.roi) * 0.6);
  const profitPoints = Math.min(40, Math.max(0, lead.product.profit) * 0.8);
  const score = Math.round(roiPoints + profitPoints);

  await prisma.lead.update({ where: { id: lead.id }, data: { score } });

  return NextResponse.json({ score, leadId: lead.id, productId: lead.productId });
}
