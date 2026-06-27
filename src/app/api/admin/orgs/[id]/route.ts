import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  scanEnabled:      z.boolean().optional(),
  receiveBroadcast: z.boolean().optional(),
  plan:             z.enum(['STARTER', 'PRO', 'ENTERPRISE']).optional(),
  trialEndsAt:      z.string().datetime().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isPlatformAdmin(session?.user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body   = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Split fields — trialEndsAt belongs to Subscription, not Organization
  const { trialEndsAt, ...orgFields } = parsed.data;

  const org = await prisma.organization.update({
    where:  { id },
    data:   orgFields,
    select: { id: true, name: true, scanEnabled: true, receiveBroadcast: true, plan: true },
  });

  // Keep subscription in sync for plan + trial date changes
  const subUpdate: Record<string, unknown> = {};
  if (orgFields.plan) subUpdate.plan = orgFields.plan;
  if (trialEndsAt !== undefined) {
    subUpdate.trialEndsAt = trialEndsAt ? new Date(trialEndsAt) : null;
  }
  if (Object.keys(subUpdate).length > 0) {
    await prisma.subscription.updateMany({ where: { orgId: id }, data: subUpdate }).catch(() => {});
  }

  // Platform-admin changes affect billing/access for an org the admin
  // doesn't belong to — record who made the change and what changed, same
  // as every other mutating route in the app.
  await prisma.auditLog.create({
    data: {
      orgId:    id,
      action:   'ADMIN_ORG_UPDATE',
      resource: 'Organization',
      metadata: { adminEmail: session!.user.email, changes: parsed.data },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, org });
}
