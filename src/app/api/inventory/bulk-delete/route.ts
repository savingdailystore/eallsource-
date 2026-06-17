import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ids } = await req.json().catch(() => ({ ids: [] }));

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'No items selected.' }, { status: 400 });
  }

  // Scope strictly to this org so users can only delete their own items.
  const result = await prisma.inventoryItem.deleteMany({
    where: { id: { in: ids }, orgId: session.user.orgId },
  });

  return NextResponse.json({ deleted: result.count });
}
