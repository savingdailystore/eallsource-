import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pushListingPrice } from '@/lib/amazon-listings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({
  historyIds: z.array(z.string()).min(1).max(100),
  action:     z.enum(['push', 'reject']),
});

interface ItemResult {
  historyId: string;
  asin:      string;
  ok:        boolean;
  status:    string;
  price?:    number;
  error?:    string;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Pushing live prices is a privileged, paid action.
  if (session.user.plan === 'STARTER') {
    return NextResponse.json({ error: 'Repricing requires a PRO or ENTERPRISE plan' }, { status: 403 });
  }
  if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body   = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const orgId = session.user.orgId;
  const { historyIds, action } = parsed.data;

  // Load proposals, scoped to this org via the rule relation.
  const proposals = await prisma.repricingHistory.findMany({
    where:   { id: { in: historyIds }, status: 'PROPOSED', rule: { orgId } },
    include: { rule: true },
  });

  // ── Reject: just mark them dismissed, no Amazon call ──────────────────────
  if (action === 'reject') {
    await prisma.repricingHistory.updateMany({
      where: { id: { in: proposals.map((p) => p.id) } },
      data:  { status: 'REJECTED' },
    });
    return NextResponse.json({ ok: true, rejected: proposals.length });
  }

  // ── Push: validate each, then send to Amazon ──────────────────────────────
  const results: ItemResult[] = [];

  for (const p of proposals) {
    const asin  = p.rule.asin;
    const price = p.recommendedPrice;

    // Last line of defense before money moves. The engine already enforces the
    // floor, but re-check here so a stale or tampered proposal can never push a
    // price below the rule's hard floor or a non-positive value.
    const floor = p.rule.floorPrice ?? 0;
    if (!(price > 0)) {
      results.push({ historyId: p.id, asin, ok: false, status: 'PROPOSED', error: 'Non-positive price — not pushed.' });
      continue;
    }
    if (price < floor) {
      results.push({ historyId: p.id, asin, ok: false, status: 'PROPOSED', error: `Below your $${floor.toFixed(2)} floor — not pushed.` });
      continue;
    }
    if (!p.sku) {
      results.push({ historyId: p.id, asin, ok: false, status: 'PROPOSED', error: 'No seller SKU — sync your Amazon inventory first.' });
      continue;
    }

    const res = await pushListingPrice(orgId, p.sku, price);

    if (res.ok) {
      await prisma.$transaction([
        prisma.repricingHistory.update({
          where: { id: p.id },
          data:  { status: 'PUSHED', pushedAt: new Date(), pushError: null },
        }),
        prisma.repricingRule.update({
          where: { id: p.ruleId },
          data:  { lastPushedPrice: price, lastPushedAt: new Date() },
        }),
      ]);
      results.push({ historyId: p.id, asin, ok: true, status: 'PUSHED', price });
    } else {
      await prisma.repricingHistory.update({
        where: { id: p.id },
        data:  { status: 'FAILED', pushError: res.error ?? 'Unknown error' },
      });
      results.push({ historyId: p.id, asin, ok: false, status: 'FAILED', error: res.error });
    }
  }

  const pushed = results.filter((r) => r.ok).length;
  const failed = results.length - pushed;
  return NextResponse.json({ ok: true, pushed, failed, results });
}
