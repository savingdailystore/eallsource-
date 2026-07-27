/**
 * POST /api/admin/candidates/[id]/reject
 *
 * Rejects any non-CERTIFIED SourceCandidate.
 * Updates SourceCandidate only — no Product, Lead, or broadcast.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';
import { rejectCandidate } from '@/services/candidateCertifier';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  certNotes: z.string().max(1000).optional(),
});

export async function POST(
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

  try {
    const result = await rejectCandidate(id, session!.user.id, parsed.data.certNotes);

    if (result.changed) {
      const candidate = await prisma.sourceCandidate.findUnique({ where: { id }, select: { orgId: true } });
      await prisma.auditLog.create({
        data: {
          orgId:    candidate?.orgId ?? '',
          userId:   session!.user.id,
          action:   'ADMIN_CANDIDATE_REJECTED',
          resource: 'SourceCandidate',
          metadata: {
            adminEmail:  email,
            candidateId: id,
            certNotes:   parsed.data.certNotes ?? null,
          },
        },
      }).catch(() => null);
    }

    return NextResponse.json({ ok: true, status: 'REJECTED', changed: result.changed });
  } catch (err) {
    const msg = (err as Error).message ?? 'Reject failed';
    const status = msg.includes('not found') ? 404 : 409;
    return NextResponse.json({ error: msg }, { status });
  }
}
