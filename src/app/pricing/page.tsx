import Link from 'next/link';
import MarketingShell, { SUPPORT_EMAIL } from '@/components/marketing/MarketingShell';
import { Check, Zap, Crown, LifeBuoy } from 'lucide-react';

export const metadata = {
  title: 'Pricing — EALLsource',
  description: 'Simple, transparent pricing for EALLsource. Start free with 3 leads/week, upgrade to Pro for 15 leads/week with full Amazon SP-API access.',
};

const STARTER_FEATURES = [
  'Up to 3 new BASIC leads/week',
  'New leads drop every Monday',
  'Lead Feed access',
  'ROI calculator',
  'Lead validation engine',
  'Export accessible leads',
  '1 user',
];

const PRO_FEATURES = [
  'Up to 15 new BASIC + PRO leads/week',
  'New leads drop every Monday',
  'Everything in Starter',
  'Amazon SP-API connection',
  'FBA inventory sync',
  'Sales & profit tracking',
  'FBA reimbursement recovery',
  'Amazon report imports',
  'Repricing approval queue',
  '1 user',
];

const ENTERPRISE_FEATURES = [
  'Custom weekly lead volume',
  'BASIC + PRO + PREMIUM leads',
  'Owner-curated lead delivery',
  'Custom sourcing criteria',
  'Higher-touch support',
];

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-8 text-center">
        <h1 className="text-4xl font-black text-slate-50">Simple, transparent pricing</h1>
        <p className="mt-4 text-lg text-slate-400">
          Start free. Upgrade when you&apos;re ready. No hidden fees.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">

          {/* Starter */}
          <div className="card p-6 flex flex-col">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center mb-4">
              <Zap className="w-5 h-5 text-slate-300" />
            </div>
            <div className="font-bold text-lg text-slate-50">Starter</div>
            <div className="mt-1 mb-1">
              <span className="text-3xl font-black text-slate-50">Free</span>
            </div>
            <p className="text-xs text-slate-500 mb-5">No credit card required</p>
            <ul className="space-y-2 text-sm text-slate-400 mb-6 flex-1">
              {STARTER_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/register" className="btn-secondary w-full flex items-center justify-center">
              Start for free
            </Link>
          </div>

          {/* Pro */}
          <div className="card p-6 flex flex-col border-blue-500/40 ring-1 ring-blue-500/20">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
              <Crown className="w-5 h-5 text-blue-400" />
            </div>
            <div className="font-bold text-lg text-slate-50">Pro</div>
            <div className="mt-1 mb-1">
              <span className="text-3xl font-black text-slate-50">$50</span>
              <span className="text-slate-500 text-sm">/mo</span>
            </div>
            <p className="text-xs text-slate-500 mb-5">$50/month · contact us to activate</p>
            <ul className="space-y-2 text-sm text-slate-400 mb-6 flex-1">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=EALLsource Pro Upgrade`}
              className="btn-primary w-full flex items-center justify-center"
            >
              Contact us to upgrade
            </a>
          </div>

          {/* Enterprise */}
          <div className="card p-6 flex flex-col sm:col-span-2 lg:col-span-1">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center mb-4">
              <LifeBuoy className="w-5 h-5 text-slate-400" />
            </div>
            <div className="font-bold text-lg text-slate-50">Enterprise</div>
            <div className="mt-1 mb-1">
              <span className="text-slate-400 text-sm font-semibold">Custom pricing</span>
            </div>
            <p className="text-xs text-slate-500 mb-5">Contact us for a quote</p>
            <ul className="space-y-2 text-sm text-slate-400 mb-6 flex-1">
              {ENTERPRISE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=EALLsource Enterprise Inquiry`}
              className="btn-secondary w-full flex items-center justify-center"
            >
              Contact us
            </a>
          </div>

        </div>

        {/* FAQ / notes */}
        <div className="mt-10 card p-6 text-sm text-slate-400 space-y-3">
          <h2 className="text-slate-100 font-semibold text-base">Frequently asked questions</h2>
          <div>
            <p className="text-slate-200 font-medium">What is a &ldquo;weekly lead drop&rdquo;?</p>
            <p className="mt-1">Every Monday, EALLsource delivers new sourced leads directly to your account up to your plan&apos;s weekly limit. Starter receives up to 3 BASIC leads; Pro receives up to 15 BASIC and PRO leads.</p>
          </div>
          <div>
            <p className="text-slate-200 font-medium">What is a BASIC vs PRO vs PREMIUM lead?</p>
            <p className="mt-1">Leads are tiered by expected ROI and demand quality. BASIC leads are included in Starter and Pro. PRO leads are higher-quality opportunities available on Pro and above. PREMIUM leads are reserved for Enterprise plans.</p>
          </div>
          <div>
            <p className="text-slate-200 font-medium">Do I need to run a scanner myself?</p>
            <p className="mt-1">No. EALLsource&apos;s sourcing engine runs on our schedule and delivers leads to you. Customer-run scanning is not available on any self-serve plan.</p>
          </div>
          <div>
            <p className="text-slate-200 font-medium">How do I upgrade to Pro?</p>
            <p className="mt-1">During our current launch period, Pro plan activation is handled manually. Email <a href={`mailto:${SUPPORT_EMAIL}?subject=EALLsource Pro Upgrade`} className="text-blue-400 hover:underline">{SUPPORT_EMAIL}</a> and we&apos;ll get you set up. Pro is billed at $50/month and can be cancelled at any time by contacting us.</p>
          </div>
          <div>
            <p className="text-slate-200 font-medium">Questions?</p>
            <p className="mt-1">
              Email us at{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-400 hover:underline">{SUPPORT_EMAIL}</a>.
            </p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
