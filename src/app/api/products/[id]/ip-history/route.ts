import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  flagged: z.boolean(),
  note:    z.string().max(500).optional(),
});

// Owner-only: mark (or clear) an ASIN's real IP-complaint history after an
// actual takedown/complaint has happened. This is asin-scoped, not org-scoped
// — propagated to every org's copy of the product — and once flagged, the
// pipeline hard-rejects the ASIN forever (see processRetailerProduct). Any
// existing leads for the ASIN across all orgs are rejected immediately.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { flagged, note } = parsed.data;

  const product = await prisma.product.findFirst({
    where:  { id, orgId: session.user.orgId },
    select: { asin: true, hasIpComplaintHistory: true },
  });
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ipComplaintNote = flagged ? (note?.trim() || null) : null;
  const previousState   = product.hasIpComplaintHistory;

  const [updated, rejectedResult] = await prisma.$transaction(async (tx) => {
    const upd = await tx.product.updateMany({
      where: { asin: product.asin },
      data:  { hasIpComplaintHistory: flagged, ipComplaintNote },
    });

    let rej = { count: 0 };
    if (flagged) {
      rej = await tx.lead.updateMany({
        where: { product: { asin: product.asin }, status: { notIn: ['REJECTED', 'EXPIRED'] } },
        data:  { status: 'REJECTED' },
      });
    }

    await tx.auditLog.create({
      data: {
        orgId:    session.user.orgId,
        userId:   session.user.id,
        action:   flagged ? 'IP_COMPLAINT_ASIN_FLAGGED' : 'IP_COMPLAINT_ASIN_CLEARED',
        resource: 'Product',
        metadata: {
          adminEmail:             session.user.email,
          productId:              id,
          asin:                   product.asin,
          previousHasIpComplaint: previousState,
          newHasIpComplaint:      flagged,
          note:                   ipComplaintNote,
          leadsRejected:          flagged ? rej.count : 0,
        },
      },
    }).catch(() => {});

    return [upd, rej] as const;
  });

  return NextResponse.json({ ok: true, flagged, updated: updated.count, leadsRejected: rejectedResult.count });
}
