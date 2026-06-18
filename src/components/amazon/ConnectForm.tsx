'use client';

import { useState } from 'react';
import { Link2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/navigation';

const MARKETPLACES = [
  { label: 'United States (amazon.com)',   id: 'ATVPDKIKX0DER' },
  { label: 'Canada (amazon.ca)',           id: 'A2EUQ1WTGCTBG2' },
  { label: 'Mexico (amazon.com.mx)',       id: 'A1AM79C64UM0Y8' },
  { label: 'United Kingdom (amazon.co.uk)',id: 'A1F83G8C2ARO7P' },
  { label: 'Germany (amazon.de)',          id: 'A1PA6795UKMFR9' },
  { label: 'France (amazon.fr)',           id: 'A13V1IB3VIYZZH' },
  { label: 'Italy (amazon.it)',            id: 'APJ6JRA9NG5V4'  },
  { label: 'Spain (amazon.es)',            id: 'A1RKKUPIHCS9HS' },
  { label: 'Japan (amazon.co.jp)',         id: 'A1VC38T7YXB528' },
];

function HelpTip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Where do I find this?
      </button>
      {open && (
        <div className="mt-2 px-3 py-2.5 bg-slate-800 rounded-lg text-xs text-slate-300 leading-relaxed border border-slate-700">
          {children}
        </div>
      )}
    </div>
  );
}

export function ConnectForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    sellerId:      '',
    marketplaceId: 'ATVPDKIKX0DER',
    refreshToken:  '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/amazon/connect', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...form, accessToken: '' }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Connection failed. Please check your details and try again.');
    } else {
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {/* Step guide */}
      <div className="space-y-3">
        {[
          {
            n: '1',
            title: 'Find your Seller ID',
            body: 'In Seller Central, go to Settings → Account Info. Under "Business Information", copy the Merchant Token. It looks like A1TWT2OVUBOAE6.',
          },
          {
            n: '2',
            title: 'Choose your marketplace',
            body: 'Select the Amazon country where your seller account is based.',
          },
          {
            n: '3',
            title: 'Get your authorization code',
            body: 'In Seller Central, go to Apps & Services → Develop Apps. Click the ▾ dropdown next to your app → Authorize. Amazon generates a code starting with Atzr|… — copy it.',
          },
        ].map((s) => (
          <div key={s.n} className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-blue-400">{s.n}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">{s.title}</p>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-800" />

      <a
        href="/dashboard/amazon/guide"
        className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5"
      >
        <span className="text-base">📖</span>
        <span>Don't have SP-API access yet? Follow our step-by-step setup guide →</span>
      </a>

      {/* Form fields */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Seller ID */}
        <div>
          <label className="label">Your Seller ID</label>
          <input
            value={form.sellerId}
            onChange={set('sellerId')}
            type="text"
            required
            className="input"
            placeholder="e.g. A1TWT2OVUBOAE6"
          />
          <HelpTip>
            In Seller Central → <strong>Settings → Account Info</strong>.<br />
            Under <strong>Business Information</strong>, look for <strong>Merchant Token</strong>. Copy the full value.
          </HelpTip>
        </div>

        {/* Marketplace */}
        <div>
          <label className="label">Your Amazon marketplace</label>
          <select value={form.marketplaceId} onChange={set('marketplaceId')} className="input">
            {MARKETPLACES.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <HelpTip>
            Choose the country where your Amazon seller account is registered.<br />
            If you sell in the US, choose <strong>United States</strong>.
          </HelpTip>
        </div>

        {/* Refresh token */}
        <div>
          <label className="label">Authorization code</label>
          <input
            value={form.refreshToken}
            onChange={set('refreshToken')}
            type="password"
            required
            className="input font-mono text-xs"
            placeholder="Atzr|…"
          />
          <HelpTip>
            In Seller Central → <strong>Apps &amp; Services → Develop Apps</strong>.<br />
            Click the <strong>▾ dropdown</strong> next to your app name → click <strong>Authorize</strong>.<br />
            Amazon shows a long code starting with <strong>Atzr|</strong> — copy the whole thing and paste it here.
          </HelpTip>
        </div>

        {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" />Connecting…</>
            : <><Link2 className="w-4 h-4" />Connect my Amazon account</>}
        </button>
      </form>
    </div>
  );
}
