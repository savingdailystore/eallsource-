import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Owner-only: delete a product (and its leads, via cascade) from the feed.
// If the caller's org is the broadcast source, the same product was fanned out
// to every subscriber — so we retract it everywhere by ASIN. A non-source org's
// owner only deletes their own copy, never anyone else's.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const orgId  = session.user.orgId;

  const product = await prisma.product.findFirst({
    where:  { id, orgId },
    select: { asin: true },
  });
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const org = await prisma.organization.findUnique({
    where: { id: orgId }, select: { isBroadcastSource: true },
  });

  // Leads cascade-delete with their product (onDelete: Cascade).
  const res = org?.isBroadcastSource
    ? await prisma.product.deleteMany({ where: { asin: product.asin } })
    : await prisma.product.deleteMany({ where: { asin: product.asin, orgId } });

  return NextResponse.json({ ok: true, deleted: res.count });
}
