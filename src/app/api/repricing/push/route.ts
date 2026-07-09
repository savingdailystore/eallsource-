import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pushListingPrice } from '@/lib/amazon-listings';
import { estimateFloorBreakdown } from '@/engines/repricingReadiness';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({
  historyIds: z.array(z.string()).min(1).max(100),
  action:     z.enum(['push', 'reject']),
  confirmed:  z.boolean().optional(),
});

interface ItemResult {
  historyId: string;
  asin:      string;
  ok:        boolean;
  status:    string;
  price?:    number;
  error?:    string;
}

// Pushes for the same rule within this window are blocked to prevent
// accidental double-pushes (e.g., rapid-clicking "Push All" twice).
const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

// Tolerance between algebraic floor estimate and the iterative engine result.
// The iterative floor can be up to ~$0.02 below the algebraic estimate (both
// round to cents from different starting points). A 3-cent buffer covers this
// with a single cent of margin — any meaningfully tampered proposal is caught.
const FLOOR_TOLERANCE = 0.03;

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
  const { historyIds, action, confirmed } = parsed.data;

  // Every live Amazon price push requires explicit user confirmation in the UI.
  // This backend guard ensures the API can never be used to push prices without
  // a deliberate confirmation step — even from scripted or accidental requests.
  if (action === 'push' && confirmed !== true) {
    return NextResponse.json(
      { error: 'Push requires explicit confirmation. Set confirmed: true to proceed.' },
      { status: 400 },
    );
  }

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
  const now = Date.now();

  for (const p of proposals) {
    const asin  = p.rule.asin;
    const price = p.recommendedPrice;

    // ── Cooldown: block re-push within 15 minutes ─────────────────────────
    if (p.rule.lastPushedAt) {
      const msAgo = now - p.rule.lastPushedAt.getTime();
      if (msAgo < COOLDOWN_MS) {
        const minsLeft = Math.ceil((COOLDOWN_MS - msAgo) / 60_000);
        const minsPast = Math.floor(msAgo / 60_000);
        results.push({
          historyId: p.id,
          asin,
          ok:     false,
          status: 'PROPOSED',
          error:  `Cooldown active — this rule was pushed ${minsPast} min ago. Wait ${minsLeft} more min before pushing again.`,
        });
        continue;
      }
    }

    // ── Non-positive price ────────────────────────────────────────────────
    if (!(price > 0)) {
      results.push({ historyId: p.id, asin, ok: false, status: 'PROPOSED', error: 'Non-positive price — not pushed.' });
      continue;
    }

    // ── Effective safe floor (defense in depth) ───────────────────────────
    // The engine already enforces the floor before writing the PROPOSED row,
    // but re-compute it here so a stale or tampered proposal can never push
    // a price below the rule's effective safe floor (ROI floor + manual floor).
    const safeFloor = estimateFloorBreakdown(
      p.rule.costBasis ?? 0,
      p.rule.minRoi,
      p.rule.minProfit,
      p.rule.floorPrice,
    ).effectiveFloor;

    if (safeFloor > 0 && price < safeFloor - FLOOR_TOLERANCE) {
      results.push({
        historyId: p.id,
        asin,
        ok:     false,
        status: 'PROPOSED',
        error:  `Below safe floor $${safeFloor.toFixed(2)} — not pushed.`,
      });
      continue;
    }

    // ── SKU required ──────────────────────────────────────────────────────
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
