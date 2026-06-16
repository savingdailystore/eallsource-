'use client';

import { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function ConnectForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    sellerId:      '',
    marketplaceId: 'ATVPDKIKX0DER',
    refreshToken:  '',
    accessToken:   '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/amazon/connect', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Connection failed. Check your credentials.');
    } else {
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Seller ID</label>
        <input value={form.sellerId} onChange={set('sellerId')} type="text" required className="input" placeholder="AXXXXXXXXXX" />
      </div>
      <div>
        <label className="label">Marketplace ID</label>
        <input value={form.marketplaceId} onChange={set('marketplaceId')} type="text" required className="input" placeholder="ATVPDKIKX0DER" />
      </div>
      <div>
        <label className="label">LWA Refresh Token</label>
        <input value={form.refreshToken} onChange={set('refreshToken')} type="password" required className="input" placeholder="Atzr|..." />
        <p className="text-xs mt-1" style={{ color: '#71717a' }}>Your Login With Amazon (LWA) refresh token from SP-API OAuth.</p>
      </div>
      <div>
        <label className="label">LWA Access Token</label>
        <input value={form.accessToken} onChange={set('accessToken')} type="password" required className="input" placeholder="Atza|..." />
        <p className="text-xs mt-1" style={{ color: '#71717a' }}>Current access token. Will be refreshed automatically using your refresh token.</p>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Link2 className="w-4 h-4" />Connect Account</>}
      </button>
    </form>
  );
}
