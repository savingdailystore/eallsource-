import MarketingShell, { SUPPORT_EMAIL } from '@/components/marketing/MarketingShell';
import { Mail, LifeBuoy, ShieldCheck } from 'lucide-react';

export const metadata = {
  title: 'Contact',
  description: 'Get in touch with the EALLsource team for support, sales, or security questions.',
};

const CHANNELS = [
  {
    icon: LifeBuoy,
    title: 'Support',
    body: 'Questions about your account, sourcing, repricing, or connecting Amazon SP-API.',
    email: SUPPORT_EMAIL,
  },
  {
    icon: Mail,
    title: 'Sales & billing',
    body: 'Plan questions, upgrades, or billing issues.',
    email: SUPPORT_EMAIL,
  },
  {
    icon: ShieldCheck,
    title: 'Security',
    body: 'Report a security concern or vulnerability. We respond to confirmed reports within 24 hours.',
    email: SUPPORT_EMAIL,
  },
];

export default function ContactPage() {
  return (
    <MarketingShell>
      <section className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-slate-50">Contact us</h1>
        <p className="mt-3 text-slate-400">
          We’re here to help. Email us at{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-400 hover:underline">{SUPPORT_EMAIL}</a>{' '}
          and we’ll get back to you, typically within one business day.
        </p>

        <div className="mt-10 grid sm:grid-cols-3 gap-5">
          {CHANNELS.map(({ icon: Icon, title, body, email }) => (
            <div key={title} className="card p-6">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-blue-400" />
              </div>
              <h2 className="font-semibold text-slate-100">{title}</h2>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">{body}</p>
              <a href={`mailto:${email}`} className="mt-3 inline-block text-sm text-blue-400 hover:underline break-all">{email}</a>
            </div>
          ))}
        </div>

        <div className="card p-6 mt-6">
          <p className="text-sm text-slate-400">
            <strong className="text-slate-200">Mailing &amp; business inquiries:</strong> reach us by email at{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-400 hover:underline">{SUPPORT_EMAIL}</a>. We
            operate as an online service and handle all correspondence electronically.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
