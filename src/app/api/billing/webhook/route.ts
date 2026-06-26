import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';

// Stripe requires the raw body for webhook signature verification
export async function POST(req: NextRequest) {
  const body      = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET ?? '',
    );
  } catch (err) {
    console.error('[webhook] signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub    = event.data.object as Stripe.Subscription;
        const item   = sub.items.data[0];
        const plan   = getPlanFromPriceId(item?.price?.id);
        const custId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

        // current_period_end moved from the subscription root to the item level
        // in newer Stripe API versions (Stripe webhook destinations can be
        // configured on a different API version than the SDK pinned in stripe.ts).
        // Reading it off the item works regardless of which version sent the event.
        const periodEndTs = (item as unknown as { current_period_end?: number })?.current_period_end
          ?? (sub as unknown as { current_period_end?: number }).current_period_end;

        const existing = await prisma.subscription.findUnique({ where: { stripeCustomerId: custId } });
        if (existing) {
          await prisma.$transaction([
            prisma.subscription.update({
              where: { stripeCustomerId: custId },
              data: {
                plan,
                stripeSubId:      sub.id,
                status:           sub.status,
                currentPeriodEnd: periodEndTs ? new Date(periodEndTs * 1000) : existing.currentPeriodEnd,
                cancelAtPeriodEnd: sub.cancel_at_period_end,
              },
            }),
            prisma.organization.update({
              where: { id: existing.orgId },
              data: { plan },
            }),
          ]);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub    = event.data.object as Stripe.Subscription;
        const custId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

        const existing = await prisma.subscription.findUnique({ where: { stripeCustomerId: custId } });
        if (existing) {
          await prisma.$transaction([
            prisma.subscription.update({
              where: { stripeCustomerId: custId },
              data: { plan: 'STARTER', status: 'canceled' },
            }),
            prisma.organization.update({
              where: { id: existing.orgId },
              data: { plan: 'STARTER' },
            }),
          ]);
        }
        break;
      }
    }

    // Log billing event
    const sub = event.data.object as any;
    const custId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    if (custId) {
      const subscription = await prisma.subscription.findUnique({ where: { stripeCustomerId: custId } });
      if (subscription) {
        await prisma.billingEvent.create({
          data: {
            subscriptionId: subscription.id,
            stripeEventId:  event.id,
            type:           event.type,
            data:           event.data.object as any,
          },
        });
      }
    }

  } catch (err) {
    console.error('[webhook] handler error:', err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function getPlanFromPriceId(priceId?: string) {
  if (!priceId) return 'STARTER' as const;
  if (priceId === process.env.STRIPE_PRO_PRICE_ID)        return 'PRO' as const;
  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) return 'ENTERPRISE' as const;
  return 'STARTER' as const;
}
