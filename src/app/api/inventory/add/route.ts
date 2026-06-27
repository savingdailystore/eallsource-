import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Quantities arrive as numbers or numeric strings from different callers
// (manual form vs. programmatic). Coerce before bounding — matches the
// previous toInt() behavior of treating non-numeric input as 0, but now with
// an explicit upper bound instead of accepting any integer parseInt returns.
const quantity = z.coerce.number().int().min(0).max(999_999).catch(0);

const schema = z.object({
  sku:               z.string().trim().max(100).nullish(),
  fnsku:             z.string().trim().max(100).nullish(),
  asin:              z.string().trim().min(1).max(20),
  productName:       z.string().trim().min(1).max(1000),
  availableQuantity: quantity.optional(),
  reservedQuantity:  quantity.optional(),
  inboundQuantity:   quantity.optional(),
  totalQuantity:     quantity.optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId  = session.user.orgId;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ error: 'ASIN and Product Name are required.' }, { status: 400 });
  }

  const { sku, fnsku, asin, productName, availableQuantity, reservedQuantity, inboundQuantity, totalQuantity } = parsed.data;
  const asinUpper = asin.toUpperCase();

  const data = {
    sku:               sku || null,
    fnsku:             fnsku || null,
    productName,
    availableQuantity: availableQuantity ?? 0,
    reservedQuantity:  reservedQuantity ?? 0,
    inboundQuantity:   inboundQuantity ?? 0,
    totalQuantity:     totalQuantity ?? 0,
  };

  const item = await prisma.inventoryItem.upsert({
    where:  { orgId_asin: { orgId, asin: asinUpper } },
    create: { orgId, asin: asinUpper, ...data },
    update: data,
  });

  return NextResponse.json(item, { status: 201 });
}
