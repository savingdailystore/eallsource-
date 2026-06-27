import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Bounded array of non-empty string IDs — Prisma's orgId-scoped deleteMany
// already prevents cross-tenant deletion regardless, but validating shape
// at the boundary catches malformed payloads before they reach the DB layer.
const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(1000),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'No items selected.' }, { status: 400 });
  }

  // Scope strictly to this org so users can only delete their own items.
  const result = await prisma.inventoryItem.deleteMany({
    where: { id: { in: parsed.data.ids }, orgId: session.user.orgId },
  });

  return NextResponse.json({ deleted: result.count });
}
