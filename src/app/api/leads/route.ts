import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCached } from '@/lib/redis';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const LEAD_STATUSES = ['NEW', 'SAVED', 'PURCHASED', 'REJECTED', 'EXPIRED'] as const;

const patchSchema = z.object({
  id:     z.string().cuid(),
  status: z.enum(LEAD_STATUSES),
  notes:  z.string().max(1000).optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp        = req.nextUrl.searchParams;
  const orgId     = session.user.orgId;
  const page      = Math.max(1, Number(sp.get('page') ?? 1));
  const pageSize  = Math.min(Number(sp.get('pageSize') ?? 25), 100);
  const rawStatus = sp.get('status');
  const status    = rawStatus && (LEAD_STATUSES as readonly string[]).includes(rawStatus)
    ? rawStatus as typeof LEAD_STATUSES[number]
    : undefined;
  const minRoi    = sp.get('minRoi')    ? Number(sp.get('minRoi'))    : undefined;
  const minProfit = sp.get('minProfit') ? Number(sp.get('minProfit')) : undefined;
  const sortBy    = sp.get('sortBy') ?? 'score';

  const where: object = {
    orgId,
    ...(status
      ? { status }
      : { status: { notIn: ['REJECTED', 'EXPIRED'] } }),
    product: {
      validationPassed: true,
      ...(minRoi    != null ? { roi:    { gte: minRoi    } } : {}),
      ...(minProfit != null ? { profit: { gte: minProfit } } : {}),
    },
  };

  const orderBy =
    sortBy === 'roi'    ? { product: { roi:    'desc' as const } } :
    sortBy === 'profit' ? { product: { profit: 'desc' as const } } :
    { score: 'desc' as const };

  const cacheKey = `leads:${orgId}:${page}:${pageSize}:${status}:${minRoi}:${minProfit}:${sortBy}`;

  const result = await getCached(cacheKey, async () => {
    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      prisma.lead.findMany({ where, orderBy, skip, take: pageSize, include: { product: true } }),
      prisma.lead.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }, 60);

  return NextResponse.json({ success: true, ...result });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body   = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { id, status, notes } = parsed.data;

  const lead = await prisma.lead.findFirst({ where: { id, orgId: session.user.orgId } });
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.lead.update({
    where: { id },
    data: {
      status,
      notes,
      ...(status === 'SAVED' ? { savedAt: new Date() } : {}),
    },
  });

  return NextResponse.json({ success: true, data: updated });
}
