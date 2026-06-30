import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// purchasedAt: accept null (clear) or a date/datetime string; reject invalid dates.
// The preprocessor converts valid strings to Date objects; z.date() then rejects any
// non-Date value (including invalid strings passed through unchanged).
const purchasedAtField = z.preprocess(
  (v) => {
    if (v == null || v === '') return null;
    const d = new Date(v as string);
    return isNaN(d.getTime()) ? v : d; // invalid strings fall through; z.date() will reject them
  },
  z.date().nullable().optional()
);

const updateSchema = z.object({
  sku:               z.string().nullable().optional(),
  fnsku:             z.string().nullable().optional(),
  asin:              z.string().min(1).optional(),
  productName:       z.string().min(1).optional(),
  availableQuantity: z.number().int().nonnegative().optional(),
  reservedQuantity:  z.number().int().nonnegative().optional(),
  inboundQuantity:   z.number().int().nonnegative().optional(),
  totalQuantity:     z.number().int().nonnegative().optional(),
  purchasedAt:       purchasedAtField,
  unitCost:          z.number().min(0).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.inventoryItem.findFirst({
    where: { id, orgId: session.user.orgId },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const item = await prisma.inventoryItem.update({
    where: { id },
    data:  parsed.data,
  });

  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.inventoryItem.findFirst({
    where: { id, orgId: session.user.orgId },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.inventoryItem.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
