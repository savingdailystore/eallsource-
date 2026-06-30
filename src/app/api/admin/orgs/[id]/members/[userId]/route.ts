import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';
import { Role } from '@prisma/client';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Accepts either a role update, a canManualLead toggle, or both.
const updateSchema = z.object({
  role:          z.enum(['ADMIN', 'ANALYST', 'VIEWER']).optional(),
  canManualLead: z.boolean().optional(),
}).refine(
  (d) => d.role !== undefined || d.canManualLead !== undefined,
  { message: 'Provide at least role or canManualLead.' },
);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const session = await auth();
  if (!isPlatformAdmin(session?.user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: orgId, userId } = await params;

  const target = await prisma.user.findFirst({ where: { id: userId, orgId } });
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  // Guard: the platform owner's role is immutable. canManualLead can be toggled freely.
  if (parsed.data.role !== undefined && isPlatformAdmin(target.email)) {
    return NextResponse.json({ error: "The platform owner's role cannot be changed." }, { status: 400 });
  }

  const data: { role?: Role; canManualLead?: boolean } = {};
  if (parsed.data.role          !== undefined) data.role          = parsed.data.role as Role;
  if (parsed.data.canManualLead !== undefined) data.canManualLead = parsed.data.canManualLead;

  const updated = await prisma.user.update({
    where:  { id: userId },
    data,
    select: { id: true, email: true, role: true, canManualLead: true },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      action:   parsed.data.role ? 'ADMIN_UPDATE_USER_ROLE' : 'ADMIN_UPDATE_USER_PERMISSION',
      resource: 'User',
      metadata: {
        adminEmail: session!.user.email,
        targetId:   userId,
        targetEmail: target.email,
        changes:    data,
      },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, user: updated });
}
