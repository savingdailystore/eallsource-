// PATCH /api/admin/brand-blocks/[id]  — clear (deactivate) a brand block

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

function isPrivileged(session: { user: { role: string; email: string } } | null): boolean {
  if (!session) return false;
  return session.user.role === 'OWNER' || isPlatformAdmin(session.user.email);
}

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!isPrivileged(session)) return NextResponse.json({ error: 'Forbidden' }, { status: session ? 403 : 401 });

  const { id } = await params;
  const { user } = session!;

  const existing = await prisma.brandBlock.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!existing.isActive) return NextResponse.json({ error: 'Brand block is already inactive' }, { status: 409 });

  const block = await prisma.$transaction(async (tx) => {
    const blk = await tx.brandBlock.update({
      where: { id },
      data: {
        isActive:        false,
        clearedAt:       new Date(),
        clearedByUserId: user.id,
        clearedByEmail:  user.email,
      },
    });

    // Un-flag products — brand is no longer blocked so they should reappear.
    await tx.product.updateMany({
      where: { brand: { equals: existing.normalizedBrand, mode: 'insensitive' } },
      data:  { isBrandBlocked: false },
    });

    await tx.auditLog.create({
      data: {
        orgId:    user.orgId,
        userId:   user.id,
        action:   'BRAND_BLOCK_CLEARED',
        resource: 'BrandBlock',
        metadata: {
          adminEmail:      user.email,
          brand:           existing.brand,
          normalizedBrand: existing.normalizedBrand,
          blockId:         id,
        },
      },
    }).catch(() => {});

    return blk;
  });

  return NextResponse.json({ ok: true, block });
}
