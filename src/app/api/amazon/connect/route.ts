import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const connectSchema = z.object({
  sellerId: z.string().min(1),
  marketplaceId: z.string().min(1),
  accessToken: z.string().optional(),          // derived from refreshToken on first call
  refreshToken: z.string().min(1),
  tokenExpiresAt: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.user.plan === 'STARTER') {
    return NextResponse.json({ error: 'Amazon SP-API requires a PRO or ENTERPRISE plan' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { sellerId, marketplaceId, accessToken, refreshToken, tokenExpiresAt } = parsed.data;

  // accessToken is optional — when blank, store an empty placeholder and leave
  // tokenExpiresAt null so getSpApiClient() refreshes it from refreshToken on first call.
  const encAccessToken = encrypt(accessToken ?? '');
  const expiresAt      = accessToken && tokenExpiresAt ? new Date(tokenExpiresAt) : null;

  const cred = await prisma.amazonCredential.upsert({
    where: { orgId: session.user.orgId },
    create: {
      orgId: session.user.orgId,
      sellerId,
      marketplaceId,
      accessToken: encAccessToken,
      refreshToken: encrypt(refreshToken),
      tokenExpiresAt: expiresAt,
      isActive: true,
    },
    update: {
      sellerId,
      marketplaceId,
      accessToken: encAccessToken,
      refreshToken: encrypt(refreshToken),
      tokenExpiresAt: expiresAt,
      isActive: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId: session.user.orgId,
      userId: session.user.id,
      action: 'AMAZON_CONNECT',
      resource: 'AmazonCredential',
      metadata: { sellerId, marketplaceId },
    },
  });

  return NextResponse.json({ id: cred.id, sellerId: cred.sellerId, isActive: cred.isActive });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cred = await prisma.amazonCredential.findUnique({
    where: { orgId: session.user.orgId },
    select: { id: true, sellerId: true, marketplaceId: true, isActive: true, tokenExpiresAt: true },
  });

  return NextResponse.json(cred ?? null);
}
