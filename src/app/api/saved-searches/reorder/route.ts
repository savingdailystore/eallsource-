import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({ ids: z.array(z.string()).min(1) });

// Persist the display order of saved searches. The client sends the full
// ordered id list; we assign positions by index. Note: this is display order
// only — the cron always runs least-recently-run first for fair coverage.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const orgId = session.user.orgId;

  // Only reorder rows that belong to this org.
  const owned = await prisma.savedSearch.findMany({
    where:  { orgId, id: { in: parsed.data.ids } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((s) => s.id));

  await prisma.$transaction(
    parsed.data.ids
      .filter((id) => ownedIds.has(id))
      .map((id, index) =>
        prisma.savedSearch.update({ where: { id }, data: { position: index } }),
      ),
  );

  return NextResponse.json({ ok: true });
}
