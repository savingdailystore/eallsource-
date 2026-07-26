/**
 * PATCH /api/admin/candidates/[id]
 *
 * Reject a SourceCandidate. This is the ONLY write in Phase 18.1.
 * REJECT sets certStatus=REJECTED on the SourceCandidate row only.
 * Does NOT touch Product, Lead, LeadEntitlement, or any broadcast.
 * CERTIFY is not implemented in this phase.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  action:    z.literal('REJECT'),
  certNotes: z.string().max(1000).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const email   = session?.user?.email;
  const role    = session?.user?.role;

  if (role !== 'OWNER' && !isPlatformAdmin(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body   = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const candidate = await prisma.sourceCandidate.findUnique({
    where:  { id },
    select: { id: true, certStatus: true, orgId: true },
  });
  if (!candidate) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
  }

  // Already rejected — idempotent
  if (candidate.certStatus === 'REJECTED') {
    return NextResponse.json({ ok: true, status: 'REJECTED', changed: false });
  }

  // Do not reject an already-certified candidate from this endpoint
  // (certification and post-certification actions are Phase 18.4+)
  if (candidate.certStatus === 'CERTIFIED') {
    return NextResponse.json({ error: 'Cannot reject a certified candidate from this endpoint.' }, { status: 409 });
  }

  const updated = await prisma.sourceCandidate.update({
    where: { id },
    data:  {
      certStatus: 'REJECTED',
      certNotes:  parsed.data.certNotes ?? null,
      rejectedAt: new Date(),
      rejectedBy: session!.user.id,
    },
    select: { id: true, certStatus: true },
  });

  await prisma.auditLog.create({
    data: {
      orgId:    candidate.orgId,
      userId:   session!.user.id,
      action:   'ADMIN_CANDIDATE_REJECTED',
      resource: 'SourceCandidate',
      metadata: {
        adminEmail: email,
        candidateId: id,
        certNotes: parsed.data.certNotes ?? null,
      },
    },
  }).catch(() => null);

  return NextResponse.json({ ok: true, status: updated.certStatus, changed: true });
}
