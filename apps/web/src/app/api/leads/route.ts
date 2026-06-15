import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status     = searchParams.get('status') ?? undefined;
  const minScore   = Number(searchParams.get('minScore') ?? 0);
  const minRoi     = Number(searchParams.get('minRoi') ?? 0);
  const page       = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize   = Math.min(50, Number(searchParams.get('pageSize') ?? 25));
  const sortBy     = searchParams.get('sortBy') ?? 'score';
  const sortOrder  = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

  const where = {
    ...(status ? { status: status as 'NEW' | 'REVIEWED' | 'PURCHASED' | 'PASSED' | 'EXPIRED' } : {}),
    score: { gte: minScore },
    roi:   { gte: minRoi },
  };

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.lead.count({ where }),
  ]);

  return NextResponse.json({
    data: leads,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { id: string; status: string };
  if (!body.id || !body.status) return NextResponse.json({ error: 'id and status required' }, { status: 400 });

  const lead = await prisma.lead.update({
    where: { id: body.id },
    data: { status: body.status as 'NEW' | 'REVIEWED' | 'PURCHASED' | 'PASSED' | 'EXPIRED' },
  });

  return NextResponse.json(lead);
}
