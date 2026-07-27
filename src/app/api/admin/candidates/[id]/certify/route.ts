/**
 * POST /api/admin/candidates/[id]/certify
 *
 * Promotes a MATCHED SourceCandidate to CERTIFIED.
 * Creates Product + Lead. Platform-admin only.
 *
 * Safety invariants:
 *   - Only MATCHED candidates with full valid economics may be certified
 *   - certifyCandidate service enforces all eligibility guards
 *   - No LeadEntitlement created here
 *   - No broadcast triggered
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';
import { certifyCandidate } from '@/services/candidateCertifier';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const email   = session?.user?.email;
  const role    = session?.user?.role;

  if (role !== 'OWNER' && !isPlatformAdmin(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const result = await certifyCandidate(id, session!.user.id);

    await prisma.auditLog.create({
      data: {
        orgId:    (await prisma.sourceCandidate.findUnique({ where: { id }, select: { orgId: true } }))?.orgId ?? '',
        userId:   session!.user.id,
        action:   'ADMIN_CANDIDATE_CERTIFIED',
        resource: 'SourceCandidate',
        metadata: {
          adminEmail:  email,
          candidateId: id,
          productId:   result.productId,
          leadId:      result.leadId,
        },
      },
    }).catch(() => null);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = (err as Error).message ?? 'Certification failed';
    const status = msg.includes('not found') ? 404
      : msg.includes('Only MATCHED') || msg.includes('outstanding review') ? 409
      : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
