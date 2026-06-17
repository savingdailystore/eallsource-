import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createBillingPortalSession } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Only the organization owner can manage billing.' }, { status: 403 });
  }

  const sub = await prisma.subscription.findUnique({
    where: { orgId: session.user.orgId },
    select: { stripeCustomerId: true },
  });

  if (!sub?.stripeCustomerId) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/dashboard/billing`, 303);
  }

  const returnUrl = `${process.env.NEXTAUTH_URL}/dashboard/billing`;
  const portal    = await createBillingPortalSession(sub.stripeCustomerId, returnUrl);

  return NextResponse.redirect(portal.url, 303);
}
