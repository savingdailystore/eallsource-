/**
 * POST /api/admin/candidates/evaluate-pending
 *
 * Batch-evaluates up to 3 RAW_CANDIDATE rows per run using the same
 * evaluateCandidate service as the single-row endpoint.
 *
 * Hard limit of 3 per call to keep SP-API and Keepa call counts bounded.
 * No cron — owner-triggered only.
 *
 * Does NOT create Product, Lead, or LeadEntitlement records.
 * Does NOT set certStatus = CERTIFIED.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';
import { evaluateCandidate } from '@/services/candidateEvaluator';

export const dynamic = 'force-dynamic';

const BATCH_LIMIT = 3;

export async function POST(_req: NextRequest) {
  const session = await auth();
  const email   = session?.user?.email;
  const role    = session?.user?.role;

  if (role !== 'OWNER' && !isPlatformAdmin(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Find the broadcast-source org
  const sourceOrg = await prisma.organization.findFirst({
    where:  { isBroadcastSource: true },
    select: { id: true },
  });
  if (!sourceOrg) {
    return NextResponse.json({ error: 'Broadcast source org not found' }, { status: 500 });
  }

  // Pick up to 3 RAW_CANDIDATE rows (oldest first)
  const pending = await prisma.sourceCandidate.findMany({
    where:   { orgId: sourceOrg.id, certStatus: 'RAW_CANDIDATE' },
    orderBy: { createdAt: 'asc' },
    take:    BATCH_LIMIT,
    select:  { id: true },
  });

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, evaluated: 0, results: [] });
  }

  const results = [];
  const errors: Array<{ candidateId: string; error: string }> = [];

  for (const { id } of pending) {
    try {
      const summary = await evaluateCandidate(id, sourceOrg.id);
      results.push(summary);
    } catch (e) {
      errors.push({ candidateId: id, error: (e as Error).message });
    }
  }

  await prisma.auditLog.create({
    data: {
      orgId:  sourceOrg.id,
      userId: session!.user.id,
      action: 'ADMIN_CANDIDATES_BATCH_EVALUATED',
      resource: 'SourceCandidate',
      metadata: {
        adminEmail: email,
        evaluated:  results.length,
        errors:     errors.length,
        batchLimit: BATCH_LIMIT,
      },
    },
  }).catch(() => null);

  return NextResponse.json({
    ok:       true,
    evaluated: results.length,
    results,
    errors: errors.length > 0 ? errors : undefined,
  });
}
