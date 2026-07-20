import MarketingShell, { SUPPORT_EMAIL } from '@/components/marketing/MarketingShell';
import { Mail, LifeBuoy, ShieldCheck, Clock } from 'lucide-react';

export const metadata = {
  title: 'Support — EALLsource',
  description: 'Get help with EALLsource. Contact our support team for account questions, billing, Amazon SP-API, and security reports.',
};

const CHANNELS = [
  {
    icon: LifeBuoy,
    title: 'General support',
    body: 'Questions about your account, lead delivery, Amazon SP-API connection, repricing, or any feature of EALLsource.',
    cta: 'Email support',
    email: SUPPORT_EMAIL,
  },
  {
    icon: Mail,
    title: 'Sales & billing',
    body: 'Plan upgrades, pricing questions, billing disputes, or Enterprise inquiries.',
    cta: 'Email sales',
    email: SUPPORT_EMAIL,
  },
  {
    icon: ShieldCheck,
    title: 'Security',
    body: 'Report a vulnerability or security concern. We treat all security reports as high priority and respond to confirmed issues within 24 hours.',
    cta: 'Report a vulnerability',
    email: SUPPORT_EMAIL,
  },
];

export default function SupportPage() {
  return (
    <MarketingShell>
      <section className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-slate-50">Support</h1>
        <p className="mt-3 text-slate-400">
          We&apos;re here to help. Email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-400 hover:underline">{SUPPORT_EMAIL}</a>{' '}
          and we&apos;ll get back to you, typically within one business day.
        </p>

        <div className="mt-10 grid sm:grid-cols-3 gap-5">
          {CHANNELS.map(({ icon: Icon, title, body, cta, email }) => (
            <div key={title} className="card p-6 flex flex-col">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-blue-400" />
              </div>
              <h2 className="font-semibold text-slate-100">{title}</h2>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed flex-1">{body}</p>
              <a
                href={`mailto:${email}`}
                className="mt-4 inline-block text-sm text-blue-400 hover:underline"
              >
                {cta} →
              </a>
            </div>
          ))}
        </div>

        <div className="mt-6 card p-6 space-y-4 text-sm text-slate-400">
          <h2 className="text-slate-100 font-semibold">Before you write</h2>

          <div className="flex gap-3">
            <Clock className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
            <p><strong className="text-slate-300">Response time:</strong> We respond to most requests within one business day. Security issues are prioritized and acknowledged within 24 hours.</p>
          </div>

          <div>
            <p className="text-slate-200 font-medium mb-1">Amazon SP-API connection issues</p>
            <p>If your Amazon account shows as disconnected or you&apos;re seeing a &ldquo;403 Forbidden&rdquo; error, check that you authorized EALLsource through the <strong className="text-slate-300">Connect with Amazon</strong> button on the Amazon SP-API page in your dashboard. Include your seller ID and the error message in your support email.</p>
          </div>

          <div>
            <p className="text-slate-200 font-medium mb-1">Billing and subscription</p>
            <p>For billing questions, include your account email and the approximate date of the charge. We use Stripe for payment processing — we never store your full card number.</p>
          </div>

          <div>
            <p className="text-slate-200 font-medium mb-1">Lead delivery questions</p>
            <p>Leads are delivered every Monday. If you believe you should have received leads but your Lead Feed is empty, include your plan tier and the week in question.</p>
          </div>
        </div>

        <div className="mt-6 card p-5 border-slate-700">
          <p className="text-sm text-slate-400">
            <strong className="text-slate-200">All inquiries:</strong>{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-400 hover:underline">{SUPPORT_EMAIL}</a>
            {' '}— we operate as an online service and handle all correspondence electronically.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
