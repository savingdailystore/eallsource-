import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/utils';
import { PLAN_PRICES } from '@/lib/stripe';
import { PLAN_LIMITS } from '@/types';
import { Check, Zap, Crown } from 'lucide-react';
import type { Plan } from '@/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Billing' };

const PLANS: { key: Plan; name: string; price: number; icon: any; color: string; features: string[] }[] = [
  {
    key: 'STARTER', name: 'Starter', price: 0, icon: Zap, color: 'text-slate-300',
    features: ['Up to 3 new BASIC leads/week', 'New leads drop weekly', 'Lead Feed access', 'ROI calculator', 'Validation engine', 'Export accessible leads', '1 user', 'No customer-run scanner'],
  },
  {
    key: 'PRO', name: 'Pro', price: 50, icon: Crown, color: 'text-blue-600',
    features: ['Up to 15 new BASIC + PRO leads/week', 'New leads drop weekly', 'Everything in Starter', 'Amazon SP-API', 'Sales & Profit Tracking', 'Profit Recovery', 'Amazon report imports', 'Repricing approval queue', 'Optional manual lead entry if enabled by EALLsource', '1 user'],
  },
];

export default async function BillingPage() {
  const session = await auth();

  // Billing is accessible to OWNER and ADMIN (OWNER = platform owner, ADMIN = customer primary user).
  if (!['OWNER', 'ADMIN'].includes(session!.user.role)) redirect('/dashboard');

  const orgId   = session!.user.orgId;
  const currentPlan = session!.user.plan;

  const subscription = await prisma.subscription.findUnique({
    where: { orgId },
  });

  // Self-serve Stripe checkout only when billing is actually wired up.
  const stripeEnabled = !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PRO_PRICE_ID;

  return (
    <div className="p-6 lg:p-8 max-w-4xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Billing & Plans</h1>
          <p className="page-subtitle">
            Current plan: <strong>{currentPlan}</strong>
            {subscription?.status === 'trialing' && subscription?.trialEndsAt && (
              <> · Trial ends {new Date(subscription.trialEndsAt).toLocaleDateString()}</>
            )}
          </p>
        </div>
      </div>

      {/* Current subscription status */}
      {subscription && (
        <div className="card p-5 border-green-500/30 bg-green-500/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-50">
                {subscription.status === 'trialing' ? 'Free Trial' : `${currentPlan} Plan`}
              </div>
              {subscription.currentPeriodEnd && (
                <div className="text-xs text-slate-400 mt-0.5">
                  {subscription.cancelAtPeriodEnd ? 'Cancels' : 'Renews'}{' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </div>
              )}
            </div>
            {subscription.stripeCustomerId && (
              <form action="/api/billing/portal" method="POST">
                <button type="submit" className="btn-secondary text-sm">
                  Manage subscription
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid md:grid-cols-2 gap-5 max-w-2xl">
        {PLANS.map((plan) => {
          const isCurrent = plan.key === currentPlan;
          return (
            <div
              key={plan.key}
              className={`card p-6 relative ${isCurrent ? 'border-green-500/30 ring-2 ring-green-500 ring-offset-2' : ''}`}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="badge bg-green-600 text-white text-xs px-3">Current Plan</span>
                </div>
              )}

              <div className={`w-10 h-10 rounded-xl ${plan.key === 'PRO' ? 'bg-blue-500/10' : 'bg-slate-800'} flex items-center justify-center mb-4`}>
                <plan.icon className={`w-5 h-5 ${plan.color}`} />
              </div>

              <div className="mb-1">
                <span className="text-lg font-bold text-slate-50">{plan.name}</span>
              </div>
              <div className="mb-4">
                <span className="text-3xl font-black text-slate-50">
                  {plan.price === 0 ? 'Free' : formatCurrency(plan.price)}
                </span>
                {plan.price > 0 && <span className="text-slate-500 text-sm">/mo</span>}
              </div>

              <ul className="space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div className="btn-secondary w-full justify-center text-slate-500 cursor-default">
                  ✓ Current plan
                </div>
              ) : stripeEnabled ? (
                <form action="/api/billing/checkout" method="POST">
                  <input type="hidden" name="plan" value={plan.key} />
                  <button
                    type="submit"
                    className={`w-full justify-center ${plan.key === 'PRO' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {currentPlan === 'STARTER' ? 'Upgrade' : plan.key === 'STARTER' ? 'Downgrade' : 'Switch'} to {plan.name}
                  </button>
                </form>
              ) : (
                <a
                  href="mailto:support@eallsource.com?subject=EALLsource plan change"
                  className={`w-full justify-center flex items-center ${plan.key === 'PRO' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  Contact us to {currentPlan === 'STARTER' ? 'upgrade' : 'change plan'}
                </a>
              )}
            </div>
          );
        })}
      </div>

      {/* Usage */}
      <div className="card p-5">
        <h2 className="font-semibold text-slate-50 mb-4">Plan Limits</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {[
            ['Leads/week', PLAN_LIMITS[currentPlan].leadsPerWeek === 9999 ? 'Unlimited' : PLAN_LIMITS[currentPlan].leadsPerWeek],
            ['Repricing', PLAN_LIMITS[currentPlan].repricing ? '✓' : '—'],
            ['SP-API',    PLAN_LIMITS[currentPlan].spApi     ? '✓' : '—'],
            ['Users',     PLAN_LIMITS[currentPlan].maxUsers  === 99 ? 'Unlimited' : PLAN_LIMITS[currentPlan].maxUsers],
          ].map(([label, value]) => (
            <div key={label as string} className="bg-slate-800/40 rounded-xl p-3">
              <div className="text-xs text-slate-500 mb-1">{label as string}</div>
              <div className="font-semibold text-slate-50">{String(value)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
