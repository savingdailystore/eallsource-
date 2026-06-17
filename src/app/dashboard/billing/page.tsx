import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/utils';
import { PLAN_PRICES } from '@/lib/stripe';
import { PLAN_LIMITS } from '@/types';
import { Check, Zap, Crown, Building2 } from 'lucide-react';
import type { Plan } from '@/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Billing' };

const PLANS: { key: Plan; name: string; price: number; icon: any; color: string; features: string[] }[] = [
  {
    key: 'STARTER', name: 'Starter', price: 0, icon: Zap, color: 'text-zinc-300',
    features: ['20 leads/day', 'ROI calculator', 'Validation engine', 'Export to CSV', '1 user'],
  },
  {
    key: 'PRO', name: 'Pro', price: 97, icon: Crown, color: 'text-orange-600',
    features: ['500 leads/day', 'Everything in Starter', 'Inventory management', 'Repricing engine', 'Amazon SP-API', '5 users'],
  },
  {
    key: 'ENTERPRISE', name: 'Enterprise', price: 297, icon: Building2, color: 'text-zinc-200',
    features: ['Unlimited leads', 'Everything in Pro', 'API access', 'Unlimited users', 'Priority support', 'Custom integrations'],
  },
];

export default async function BillingPage() {
  const session = await auth();

  // Billing is restricted to the organization Owner for now.
  if (session!.user.role !== 'OWNER') redirect('/dashboard');

  const orgId   = session!.user.orgId;
  const currentPlan = session!.user.plan;

  const subscription = await prisma.subscription.findUnique({
    where: { orgId },
  });

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
              <div className="text-sm font-semibold text-zinc-50">
                {subscription.status === 'trialing' ? 'Free Trial' : `${currentPlan} Plan`}
              </div>
              {subscription.currentPeriodEnd && (
                <div className="text-xs text-zinc-400 mt-0.5">
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
      <div className="grid md:grid-cols-3 gap-5">
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

              <div className={`w-10 h-10 rounded-xl ${plan.key === 'PRO' ? 'bg-orange-500/10' : plan.key === 'ENTERPRISE' ? 'bg-zinc-800' : 'bg-zinc-800'} flex items-center justify-center mb-4`}>
                <plan.icon className={`w-5 h-5 ${plan.color}`} />
              </div>

              <div className="mb-1">
                <span className="text-lg font-bold text-zinc-50">{plan.name}</span>
              </div>
              <div className="mb-4">
                <span className="text-3xl font-black text-zinc-50">
                  {plan.price === 0 ? 'Free' : formatCurrency(plan.price)}
                </span>
                {plan.price > 0 && <span className="text-zinc-500 text-sm">/mo</span>}
              </div>

              <ul className="space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div className="btn-secondary w-full justify-center text-zinc-500 cursor-default">
                  ✓ Current plan
                </div>
              ) : (
                <form action="/api/billing/checkout" method="POST">
                  <input type="hidden" name="plan" value={plan.key} />
                  <button
                    type="submit"
                    className={`w-full justify-center ${plan.key === 'PRO' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {currentPlan === 'STARTER' ? 'Upgrade' : plan.key === 'STARTER' ? 'Downgrade' : 'Switch'} to {plan.name}
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      {/* Usage */}
      <div className="card p-5">
        <h2 className="font-semibold text-zinc-50 mb-4">Plan Limits</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {[
            ['Leads/day', PLAN_LIMITS[currentPlan].leadsPerDay === 9999 ? 'Unlimited' : PLAN_LIMITS[currentPlan].leadsPerDay],
            ['Repricing', PLAN_LIMITS[currentPlan].repricing ? '✓' : '—'],
            ['SP-API',    PLAN_LIMITS[currentPlan].spApi     ? '✓' : '—'],
            ['Users',     PLAN_LIMITS[currentPlan].maxUsers  === 99 ? 'Unlimited' : PLAN_LIMITS[currentPlan].maxUsers],
          ].map(([label, value]) => (
            <div key={label as string} className="bg-zinc-800/40 rounded-xl p-3">
              <div className="text-xs text-zinc-500 mb-1">{label as string}</div>
              <div className="font-semibold text-zinc-50">{String(value)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
