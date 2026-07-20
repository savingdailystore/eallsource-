// GET  /api/admin/brand-blocks  — list all brand blocks (OWNER / platform admin)
// POST /api/admin/brand-blocks  — create brand block: normalize, reject leads, AuditLog

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';
import { normalizeBrand } from '@/lib/brand';

export const dynamic = 'force-dynamic';

function isPrivileged(session: { user: { role: string; email: string } } | null): boolean {
  if (!session) return false;
  return session.user.role === 'OWNER' || isPlatformAdmin(session.user.email);
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!isPrivileged(session)) return NextResponse.json({ error: 'Forbidden' }, { status: session ? 403 : 401 });

  const blocks = await prisma.brandBlock.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json({ ok: true, blocks });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isPrivileged(session)) return NextResponse.json({ error: 'Forbidden' }, { status: session ? 403 : 401 });

  const body = await req.json().catch(() => null);
  const rawBrand: string | undefined = body?.brand;
  if (!rawBrand || typeof rawBrand !== 'string' || !rawBrand.trim()) {
    return NextResponse.json({ error: 'brand is required' }, { status: 400 });
  }

  const brand = rawBrand.trim();                  // canonical stored form
  const normalizedBrandVal = normalizeBrand(brand); // lowercase+collapsed for lookup
  const reason: string | null  = body?.reason ?? null;
  const note:   string | null  = body?.note   ?? null;

  // Check for existing block (active or inactive) to avoid creating a duplicate.
  const existing = await prisma.brandBlock.findUnique({
    where: { normalizedBrand: normalizedBrandVal },
  });

  if (existing?.isActive) {
    return NextResponse.json({ error: 'Brand is already actively blocked', blockId: existing.id }, { status: 409 });
  }

  const { user } = session!;

  const [block, leadsRejected] = await prisma.$transaction(async (tx) => {
    // Create or reactivate the brand block record.
    const blk = existing
      ? await tx.brandBlock.update({
          where: { id: existing.id },
          data: {
            brand,
            reason,
            note,
            isActive:       true,
            clearedAt:      null,
            clearedByUserId: null,
            clearedByEmail:  null,
            createdByUserId: user.id,
            createdByEmail:  user.email,
          },
        })
      : await tx.brandBlock.create({
          data: {
            brand,
            normalizedBrand: normalizedBrandVal,
            reason,
            note,
            isActive:        true,
            createdByUserId: user.id,
            createdByEmail:  user.email,
          },
        });

    // Flag all products in all orgs whose brand matches.
    await tx.product.updateMany({
      where: { brand: { equals: normalizedBrandVal, mode: 'insensitive' } },
      data:  { isBrandBlocked: true },
    });

    // Reject all active leads for products from this brand, across all orgs.
    const rejected = await tx.lead.updateMany({
      where: {
        status:  { notIn: ['REJECTED', 'EXPIRED'] },
        product: { brand: { equals: normalizedBrandVal, mode: 'insensitive' } },
      },
      data: { status: 'REJECTED' },
    });

    await tx.auditLog.create({
      data: {
        orgId:    user.orgId,
        userId:   user.id,
        action:   'BRAND_BLOCK_CREATED',
        resource: 'BrandBlock',
        metadata: {
          adminEmail:      user.email,
          brand,
          normalizedBrand: normalizedBrandVal,
          reason,
          note,
          leadsRejected:   rejected.count,
          blockId:         blk.id,
          reactivated:     !!existing,
        },
      },
    }).catch(() => {});

    return [blk, rejected.count] as const;
  });

  return NextResponse.json({ ok: true, block, leadsRejected });
}
