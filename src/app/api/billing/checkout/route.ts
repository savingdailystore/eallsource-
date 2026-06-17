import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createCheckoutSession, createStripeCustomer, PRICE_IDS } from '@/lib/stripe';
import type { Plan } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Only the organization owner can manage billing.' }, { status: 403 });
  }

  const formData = await req.formData();
  const plan     = formData.get('plan') as Plan;
  const priceId  = PRICE_IDS[plan];

  if (!priceId) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  const orgId = session.user.orgId;
  let sub = await prisma.subscription.findUnique({ where: { orgId } });

  // Create Stripe customer if needed
  let customerId = sub?.stripeCustomerId;
  if (!customerId) {
    const org      = await prisma.organization.findUnique({ where: { id: orgId } });
    const customer = await createStripeCustomer(session.user.email, org?.name ?? 'Unknown');
    customerId     = customer.id;

    await prisma.subscription.upsert({
      where:  { orgId },
      create: { orgId, plan: 'STARTER', status: 'incomplete', stripeCustomerId: customerId },
      update: { stripeCustomerId: customerId },
    });
  }

  const returnUrl   = `${process.env.NEXTAUTH_URL}/dashboard/billing`;
  const checkoutUrl = await createCheckoutSession(customerId, priceId, returnUrl);

  return NextResponse.redirect(checkoutUrl.url ?? returnUrl, 303);
}
