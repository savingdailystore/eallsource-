import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({ notes: z.string().max(1000) });

// Owner-only: edit a product's sourcing notes. Because leads are broadcast,
// the same product exists (by ASIN) in every receiver org — so we propagate
// the note to all copies, keeping the shared note consistent for all users.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const notes = parsed.data.notes.trim() || null;

  // The product must belong to the owner's org.
  const product = await prisma.product.findFirst({
    where:  { id, orgId: session.user.orgId },
    select: { asin: true },
  });
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Update this product and every other org's copy of the same ASIN.
  const res = await prisma.product.updateMany({
    where: { asin: product.asin },
    data:  { notes },
  });

  return NextResponse.json({ ok: true, notes, updated: res.count });
}
