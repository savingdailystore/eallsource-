import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import MarketingShell from '@/components/marketing/MarketingShell';
import { ScanSearch, LineChart, RefreshCw, Boxes, ShieldCheck, Link2, Check, Zap, Crown, LifeBuoy } from 'lucide-react';

export const metadata = {
  title: 'EALLsource · Amazon FBA Arbitrage Sourcing & Repricing',
  description:
    'EALLsource finds profitable online-arbitrage leads from major retailers, validates them against live Amazon pricing and fees, and helps you reprice your FBA listings through a safe approval queue.',
};

const FEATURES = [
  { icon: ScanSearch,  title: 'Automated sourcing', body: 'Scan major retailers on a schedule for clearance and arbitrage leads, matched to Amazon catalog listings by UPC and title.' },
  { icon: LineChart,   title: 'Real profit & ROI', body: 'Every lead is validated against live Amazon buy-box pricing, referral and FBA fee estimates, and sales-rank demand — no guesswork.' },
  { icon: Boxes,       title: 'FBA inventory sync', body: 'Connect Amazon SP-API to pull your live FBA inventory and refresh stock levels from Amazon on demand.' },
  { icon: RefreshCw,   title: 'Smart repricing', body: 'Rule-based repricing proposes and pushes competitive prices to Amazon through a safe approval queue.' },
  { icon: ShieldCheck, title: 'Secure by default', body: 'MFA on every account, AES-256-GCM encryption for all Amazon tokens at rest, and TLS in transit.' },
  { icon: Link2,       title: 'One-click Amazon connect', body: 'Authorize your seller account through Amazon’s official OAuth flow — no spreadsheets, no manual keys.' },
];

export default async function RootPage() {
  const session = await auth();
  if (session) redirect('/dashboard');

  return (
    <MarketingShell>
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <span className="badge bg-blue-500/10 text-blue-400 border border-blue-500/20">Amazon FBA Arbitrage Platform</span>
        <h1 className="mt-6 text-4xl sm:text-5xl font-black tracking-tight text-slate-50 leading-tight">
          Find profitable Amazon leads.<br />Validate the margin. Reprice with confidence.
        </h1>
        <p className="mt-5 max-w-2xl mx-auto text-lg text-slate-400">
          EALLsource scans major retailers for online-arbitrage opportunities, checks each one against live
          Amazon pricing, fees, and demand, and helps you reprice your FBA listings — all in one place.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/register" className="btn-primary px-6 py-3 text-base">Start for free</Link>
          <Link href="/login" className="btn-secondary px-6 py-3 text-base">Sign in</Link>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-6">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="font-semibold text-slate-100">{title}</h3>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-slate-50">Simple, transparent pricing</h2>
          <p className="mt-3 text-slate-400">Start free. Upgrade when you're ready.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Starter */}
          <div className="card p-6 flex flex-col">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center mb-4">
              <Zap className="w-5 h-5 text-slate-300" />
            </div>
            <div className="font-bold text-lg text-slate-50">Starter</div>
            <div className="mt-1 mb-5">
              <span className="text-3xl font-black text-slate-50">Free</span>
            </div>
            <ul className="space-y-2 text-sm text-slate-400 mb-6 flex-1">
              {['3 leads/week', 'ROI calculator', 'Validation engine', 'Export to CSV', '1 user'].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0" />{f}
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
            <div className="mt-1 mb-5">
              <span className="text-3xl font-black text-slate-50">$50</span>
              <span className="text-slate-500 text-sm">/mo</span>
            </div>
            <ul className="space-y-2 text-sm text-slate-400 mb-6 flex-1">
              {[
                '20 leads/week',
                'Everything in Starter',
                'Amazon SP-API',
                'Sales & Profit Tracking',
                'Profit Recovery',
                'Amazon report imports',
                'Repricing approval queue',
                '1 user',
              ].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0" />{f}
                </li>
              ))}
            </ul>
            <Link href="/register" className="btn-primary w-full flex items-center justify-center">
              Start for free
            </Link>
          </div>

          {/* Need more? */}
          <div className="card p-6 flex flex-col sm:col-span-2 lg:col-span-1">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center mb-4">
              <LifeBuoy className="w-5 h-5 text-slate-400" />
            </div>
            <div className="font-bold text-lg text-slate-50">Need more?</div>
            <div className="mt-1 mb-5">
              <span className="text-slate-400 text-sm">Custom</span>
            </div>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed flex-1">
              Have volume or team requirements? Get in touch and we'll find the right fit.
            </p>
            <a
              href="mailto:support@eallsource.com?subject=EALLsource Enterprise Inquiry"
              className="btn-secondary w-full flex items-center justify-center"
            >
              Contact us
            </a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="card p-10 text-center">
          <h2 className="text-2xl font-bold text-slate-50">Ready to source smarter?</h2>
          <p className="mt-3 text-slate-400">Start free — no credit card required. Upgrade to Pro for full sourcing, repricing, and Amazon SP-API access.</p>
          <Link href="/register" className="btn-primary px-6 py-3 text-base mt-6">Create your free account</Link>
        </div>
      </section>
    </MarketingShell>
  );
}
