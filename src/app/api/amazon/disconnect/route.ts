import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = await prisma.amazonCredential.findUnique({
    where: { orgId: session.user.orgId },
  });
  if (!existing) return NextResponse.json({ error: 'No credentials found' }, { status: 404 });

  await prisma.amazonCredential.update({
    where: { orgId: session.user.orgId },
    data: { isActive: false },
  });

  await prisma.auditLog.create({
    data: {
      orgId: session.user.orgId,
      userId: session.user.id,
      action: 'AMAZON_DISCONNECT',
      resource: 'AmazonCredential',
    },
  });

  return NextResponse.json({ success: true });
}
