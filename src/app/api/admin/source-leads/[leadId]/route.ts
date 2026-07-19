import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  leadTier: z.enum(['BASIC', 'PRO', 'PREMIUM']).optional(),
  status:   z.enum(['NEW', 'REJECTED', 'EXPIRED']).optional(),
}).refine(d => d.leadTier !== undefined || d.status !== undefined, {
  message: 'At least one of leadTier or status must be provided',
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const session = await auth();
  if (!isPlatformAdmin(session?.user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { leadId } = await params;

  const body   = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const { leadTier, status } = parsed.data;

  // Must be a source-pool lead
  const lead = await prisma.lead.findFirst({
    where:  { id: leadId, org: { isBroadcastSource: true } },
    select: { id: true, leadTier: true, status: true, orgId: true },
  });

  if (!lead) {
    return NextResponse.json({ error: 'Source lead not found' }, { status: 404 });
  }

  const before = { leadTier: lead.leadTier, status: lead.status };

  const updated = await prisma.lead.update({
    where: { id: leadId },
    data:  {
      ...(leadTier !== undefined ? { leadTier } : {}),
      ...(status   !== undefined ? { status }   : {}),
    },
    select: { id: true, leadTier: true, status: true },
  });

  await prisma.auditLog.create({
    data: {
      orgId:    lead.orgId,
      userId:   session!.user.id,
      action:   'ADMIN_SOURCE_LEAD_UPDATE',
      resource: 'Lead',
      metadata: {
        adminEmail: session!.user.email,
        leadId,
        before,
        after: { leadTier: updated.leadTier, status: updated.status },
      },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, lead: updated });
}
