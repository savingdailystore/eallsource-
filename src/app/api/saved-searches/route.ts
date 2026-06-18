import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getRetailerNames } from '@/retailers';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  retailer: z.string().min(1),
  query:    z.string().min(1).max(200),
});

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const searches = await prisma.savedSearch.findMany({
    where:   { orgId: session.user.orgId },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ searches, retailers: getRetailerNames() });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const { retailer, query } = parsed.data;
  if (!getRetailerNames().includes(retailer)) {
    return NextResponse.json({ error: `Unknown retailer: ${retailer}` }, { status: 400 });
  }

  const search = await prisma.savedSearch.create({
    data: { orgId: session.user.orgId, retailer, query: query.trim() },
  });

  return NextResponse.json({ search });
}
