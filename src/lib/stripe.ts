import Stripe from 'stripe';
import type { Plan } from '@/types';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
    _stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' });
  }
  return _stripe;
}

export const PRICE_IDS: Record<Plan, string | undefined> = {
  STARTER:    process.env.STRIPE_STARTER_PRICE_ID,
  PRO:        process.env.STRIPE_PRO_PRICE_ID,
  ENTERPRISE: process.env.STRIPE_ENTERPRISE_PRICE_ID,
};

export const PLAN_PRICES: Record<Plan, number> = {
  STARTER:    0,
  PRO:        50,
  ENTERPRISE: 297,
};

export async function createStripeCustomer(email: string, orgName: string) {
  return getStripe().customers.create({ email, name: orgName, metadata: { source: 'arbitrage-pro-ai' } });
}

export async function createSubscription(customerId: string, priceId: string) {
  return getStripe().subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    trial_period_days: 14,
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
  });
}

export async function createBillingPortalSession(customerId: string, returnUrl: string) {
  return getStripe().billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
}

export async function createCheckoutSession(customerId: string, priceId: string, returnUrl: string) {
  return getStripe().checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: returnUrl,
    allow_promotion_codes: true,
  });
}
