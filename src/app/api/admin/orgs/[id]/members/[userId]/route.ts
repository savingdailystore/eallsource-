import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Valid roles an admin can assign. OWNER is excluded — the owner role is set
// at account creation and is never reassignable (see invite flow in /api/team).
const roleSchema = z.object({
  role: z.enum(['ADMIN', 'ANALYST', 'VIEWER']),
});

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

  // Guard: OWNER role is immutable. Because the invite flow only allows
  // ADMIN/ANALYST/VIEWER, there is exactly one OWNER per org — blocking any
  // change to their role is equivalent to protecting the last owner.
  if (target.role === 'OWNER') {
    return NextResponse.json({ error: "The owner's role cannot be changed." }, { status: 400 });
  }

  const body = await req.json();
  const parsed = roleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where:  { id: userId },
    data:   { role: parsed.data.role },
    select: { id: true, email: true, role: true },
  });

  // Reuse the existing audit pattern — same table, same shape as other role
  // mutations (see /api/team/[id] PATCH and /api/admin/orgs/[id] PATCH).
  await prisma.auditLog.create({
    data: {
      orgId,
      action:   'ADMIN_UPDATE_USER_ROLE',
      resource: 'User',
      metadata: {
        adminEmail: session!.user.email,
        targetId:   userId,
        targetEmail: target.email,
        fromRole:   target.role,
        toRole:     parsed.data.role,
      },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, user: updated });
}
