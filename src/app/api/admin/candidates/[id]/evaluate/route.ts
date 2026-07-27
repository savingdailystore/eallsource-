/**
 * POST /api/admin/candidates/[id]/evaluate
 *
 * Evaluates a single SourceCandidate: runs SP-API + Keepa lookups and all
 * safety gates, then writes enrichment data back to SourceCandidate only.
 *
 * Does NOT create Product, Lead, or LeadEntitlement records.
 * Does NOT set certStatus = CERTIFIED.
 * Does NOT call processRetailerProduct or broadcastLeads.
 * Does NOT use force:true.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';
import { evaluateCandidate } from '@/services/candidateEvaluator';

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

  // Resolve candidate + orgId — we pass the candidate's own orgId to the
  // evaluator so SP-API calls use the broadcast-source org's credentials.
  const candidate = await prisma.sourceCandidate.findUnique({
    where:  { id },
    select: { id: true, orgId: true, certStatus: true },
  });
  if (!candidate) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
  }
  if (candidate.certStatus === 'CERTIFIED') {
    return NextResponse.json({ error: 'Cannot re-evaluate a certified candidate' }, { status: 409 });
  }

  const result = await evaluateCandidate(id, candidate.orgId);

  await prisma.auditLog.create({
    data: {
      orgId:    candidate.orgId,
      userId:   session!.user.id,
      action:   'ADMIN_CANDIDATE_EVALUATED',
      resource: 'SourceCandidate',
      metadata: {
        adminEmail:     email,
        candidateId:    id,
        prevStatus:     result.prevStatus,
        newStatus:      result.newStatus,
        asin:           result.asin,
        matchMethod:    result.matchMethod,
        buyBoxPrice:    result.buyBoxPrice,
        estimatedProfit: result.estimatedProfit,
        estimatedRoi:   result.estimatedRoi,
      },
    },
  }).catch(() => null);

  return NextResponse.json({ ok: true, result });
}
