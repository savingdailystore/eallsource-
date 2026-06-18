import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = ['savingdailystore@gmail.com'];

const patchSchema = z.object({
  scanEnabled:      z.boolean().optional(),
  receiveBroadcast: z.boolean().optional(),
  plan:             z.enum(['STARTER', 'PRO', 'ENTERPRISE']).optional(),
  trialEndsAt:      z.string().datetime().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body   = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const org = await prisma.organization.update({
    where:  { id },
    data:   parsed.data,
    select: { id: true, name: true, scanEnabled: true, receiveBroadcast: true, plan: true },
  });

  // Keep subscription in sync for plan + trial date changes
  const subUpdate: Record<string, unknown> = {};
  if (parsed.data.plan) subUpdate.plan = parsed.data.plan;
  if (parsed.data.trialEndsAt !== undefined) {
    subUpdate.trialEndsAt = parsed.data.trialEndsAt ? new Date(parsed.data.trialEndsAt) : null;
  }
  if (Object.keys(subUpdate).length > 0) {
    await prisma.subscription.updateMany({ where: { orgId: id }, data: subUpdate }).catch(() => {});
  }

  return NextResponse.json({ ok: true, org });
}
