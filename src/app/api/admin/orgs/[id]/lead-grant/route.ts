import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';
import { copyLeadToOrg } from '@/services/broadcast';
import { getCurrentDeliveryWeekStart } from '@/lib/lead-delivery';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  sourceLeadId:           z.string().min(1),
  countsTowardWeeklyLimit: z.boolean().optional().default(false),
  note:                   z.string().max(500).optional(),
});

// POST /api/admin/orgs/[id]/lead-grant
// Grants a source-pool lead to a target customer org as an OWNER_GRANT entitlement.
// Platform-admin only. Never triggers scanners or broadcastLeads.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!isPlatformAdmin(session?.user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: targetOrgId } = await params;

  const body   = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const { sourceLeadId, countsTowardWeeklyLimit, note } = parsed.data;

  // Validate target org — must exist and must not be the source org
  const targetOrg = await prisma.organization.findUnique({
    where:  { id: targetOrgId },
    select: { id: true, isBroadcastSource: true },
  });
  if (!targetOrg) {
    return NextResponse.json({ error: 'Target org not found' }, { status: 404 });
  }
  if (targetOrg.isBroadcastSource) {
    return NextResponse.json({ error: 'Cannot grant leads to the source org' }, { status: 400 });
  }

  // Validate source lead — must exist in a broadcast-source org and be active
  const sourceLead = await prisma.lead.findFirst({
    where:   { id: sourceLeadId, org: { isBroadcastSource: true } },
    include: { product: true },
  });
  if (!sourceLead) {
    return NextResponse.json({ error: 'Source lead not found or not in source pool' }, { status: 404 });
  }
  if (sourceLead.status === 'REJECTED' || sourceLead.status === 'EXPIRED') {
    return NextResponse.json({ error: 'Cannot grant a rejected or expired lead.' }, { status: 400 });
  }

  // Copy the lead into the target org (idempotent upsert — returns existing lead ID if already copied)
  const copiedLeadId = await copyLeadToOrg(targetOrgId, sourceLead);

  // Check if this target org already has an entitlement for the copied lead
  const existing = await prisma.leadEntitlement.findUnique({
    where:  { orgId_leadId: { orgId: targetOrgId, leadId: copiedLeadId } },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({
      ok:                     true,
      alreadyGranted:         true,
      copiedLeadId,
      entitlementId:          existing.id,
      countsTowardWeeklyLimit: false,
    });
  }

  // Determine week anchor — only set if this grant counts toward quota
  const deliveryWeekStart = countsTowardWeeklyLimit ? getCurrentDeliveryWeekStart() : null;

  const entitlement = await prisma.leadEntitlement.create({
    data: {
      orgId:                   targetOrgId,
      leadId:                  copiedLeadId,
      deliverySource:          'OWNER_GRANT',
      countsTowardWeeklyLimit,
      leadTierAtDelivery:      sourceLead.leadTier,
      deliveryWeekStart,
      deliveredAt:             new Date(),
      grantedByUserId:         session!.user.id,
      note:                    note ?? null,
    },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      orgId:    targetOrgId,
      userId:   session!.user.id,
      action:   'OWNER_LEAD_GRANT',
      resource: 'LeadEntitlement',
      metadata: {
        adminEmail:              session!.user.email,
        sourceLeadId,
        copiedLeadId,
        entitlementId:           entitlement.id,
        countsTowardWeeklyLimit,
        note: note ?? null,
      },
    },
  }).catch(() => {});

  return NextResponse.json({
    ok:                     true,
    alreadyGranted:         false,
    copiedLeadId,
    entitlementId:          entitlement.id,
    countsTowardWeeklyLimit,
  });
}
