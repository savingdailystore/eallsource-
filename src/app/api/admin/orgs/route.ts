import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = ['savingdailystore@gmail.com'];

export async function GET() {
  const session = await auth();
  if (!session?.user || !ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      scanEnabled: true,
      createdAt: true,
      _count: { select: { users: true, leads: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ orgs });
}
