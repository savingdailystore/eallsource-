import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  asin:       z.string().min(10).max(10),
  title:      z.string().max(500).optional(),
  minRoi:     z.number().min(0).max(500).default(30),
  minProfit:  z.number().min(0).default(5),
  strategy:   z.enum(['COMPETITIVE', 'FLOOR', 'CEILING']).default('COMPETITIVE'),
  floorPrice: z.number().min(0).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.user.plan === 'STARTER') {
    return NextResponse.json({ error: 'Repricing requires PRO or ENTERPRISE plan' }, { status: 403 });
  }

  const rules = await prisma.repricingRule.findMany({
    where: { orgId: session.user.orgId },
    orderBy: { createdAt: 'desc' },
    include: { history: { orderBy: { createdAt: 'desc' }, take: 5 } },
  });

  return NextResponse.json({ success: true, data: rules });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.user.plan === 'STARTER') {
    return NextResponse.json({ error: 'Repricing requires PRO or ENTERPRISE plan' }, { status: 403 });
  }

  if (!['OWNER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body   = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { asin, title, minRoi, minProfit, strategy, floorPrice } = parsed.data;

  const existing = await prisma.repricingRule.findUnique({
    where: { orgId_asin: { orgId: session.user.orgId, asin } },
  });
  if (existing) {
    return NextResponse.json({ error: 'A repricing rule for this ASIN already exists' }, { status: 409 });
  }

  const rule = await prisma.repricingRule.create({
    data: {
      orgId: session.user.orgId,
      asin,
      title,
      minRoi,
      minProfit,
      strategy,
      floorPrice: floorPrice ?? null,
    },
  });

  return NextResponse.json({ success: true, data: rule }, { status: 201 });
}
