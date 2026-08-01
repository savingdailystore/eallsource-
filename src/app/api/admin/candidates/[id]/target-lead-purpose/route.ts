/**
 * PATCH /api/admin/candidates/[id]/target-lead-purpose
 *
 * Sets SourceCandidate.targetLeadPurpose so the evaluator and certifier
 * apply the correct purpose-aware thresholds on the next evaluation.
 *
 * Safety rules:
 *   - OWNER role OR platform admin email required
 *   - Only PROFIT or STARTER_SALES are valid values
 *   - MATCHED and CERTIFIED candidates are blocked — purpose must be set
 *     before evaluation, not after a completed evaluation path
 *   - Only targetLeadPurpose is written; certStatus, certNotes, and all
 *     economics fields are untouched
 *   - No evaluation, certification, or broadcast is triggered
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  targetLeadPurpose: z.enum(['PROFIT', 'STARTER_SALES']),
});

// certStatus values that allow purpose to be updated
const UPDATABLE_STATUSES = new Set([
  'RAW_CANDIDATE',
  'NEEDS_REVIEW',
  'NO_LONGER_PROFITABLE',
  'REJECTED',
]);

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const { targetLeadPurpose } = parsed.data;
  const { id } = await params;

  const candidate = await prisma.sourceCandidate.findUnique({
    where:  { id },
    select: { id: true, certStatus: true, orgId: true },
  });

  if (!candidate) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
  }

  if (!UPDATABLE_STATUSES.has(candidate.certStatus)) {
    return NextResponse.json(
      { error: `Cannot update targetLeadPurpose on a ${candidate.certStatus} candidate — re-evaluate first` },
      { status: 409 },
    );
  }

  await prisma.sourceCandidate.update({
    where: { id },
    data:  { targetLeadPurpose },
  });

  await prisma.auditLog.create({
    data: {
      orgId:    candidate.orgId,
      userId:   session!.user.id,
      action:   'ADMIN_CANDIDATE_PURPOSE_SET',
      resource: 'SourceCandidate',
      metadata: { adminEmail: email, candidateId: id, targetLeadPurpose, certStatus: candidate.certStatus },
    },
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    candidateId:       id,
    targetLeadPurpose,
    certStatus:        candidate.certStatus,
  });
}
