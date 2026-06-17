'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ShieldOff, Loader2, Check } from 'lucide-react';

export function MfaSettings({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [mode, setMode]       = useState<'idle' | 'setup' | 'disable'>('idle');
  const [qr, setQr]           = useState('');
  const [secret, setSecret]   = useState('');
  const [code, setCode]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function startSetup() {
    setLoading(true);
    setError('');
    const res  = await fetch('/api/mfa/setup', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { setError(data.error ?? 'Failed to start setup.'); return; }
    setQr(data.qr);
    setSecret(data.secret);
    setMode('setup');
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res  = await fetch('/api/mfa/enable', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { setError(data.error ?? 'Failed to enable MFA.'); return; }
    setMode('idle'); setCode(''); setQr(''); setSecret('');
    router.refresh();
  }

  async function confirmDisable(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res  = await fetch('/api/mfa/disable', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { setError(data.error ?? 'Failed to disable MFA.'); return; }
    setMode('idle'); setPassword('');
    router.refresh();
  }

  // Enabled + not mid-action
  if (enabled && mode === 'idle') {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-green-400">
          <ShieldCheck className="w-4 h-4" />
          <span className="font-medium">Two-factor authentication is on</span>
        </div>
        <button onClick={() => setMode('disable')} className="btn-secondary text-xs py-1.5">
          <ShieldOff className="w-3.5 h-3.5" />Disable
        </button>
      </div>
    );
  }

  if (mode === 'disable') {
    return (
      <form onSubmit={confirmDisable} className="space-y-3 max-w-sm">
        <p className="text-sm text-zinc-300">Enter your password to turn off two-factor authentication.</p>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="Your password" autoComplete="current-password" />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => { setMode('idle'); setError(''); }} className="btn-secondary text-sm">Cancel</button>
          <button type="submit" disabled={loading} className="btn-danger text-sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Disable MFA'}
          </button>
        </div>
      </form>
    );
  }

  if (mode === 'setup') {
    return (
      <form onSubmit={confirmEnable} className="space-y-4 max-w-sm">
        <p className="text-sm text-zinc-300">
          Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password), then enter the 6-digit code to confirm.
        </p>
        {qr && <img src={qr} alt="MFA QR code" className="w-44 h-44 border border-zinc-800 rounded-xl" />}
        <div className="text-xs text-zinc-400">
          Can't scan? Enter this key manually:
          <div className="font-mono text-zinc-200 break-all mt-1 bg-zinc-800/40 rounded-lg px-2 py-1">{secret}</div>
        </div>
        <div>
          <label className="label">6-digit code</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} required className="input tracking-widest text-center font-mono" placeholder="000000" />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => { setMode('idle'); setError(''); }} className="btn-secondary text-sm">Cancel</button>
          <button type="submit" disabled={loading} className="btn-primary text-sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />Verify &amp; enable</>}
          </button>
        </div>
      </form>
    );
  }

  // Disabled + idle
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <ShieldOff className="w-4 h-4 text-zinc-500" />
        <span>Two-factor authentication is off</span>
      </div>
      <button onClick={startSetup} disabled={loading} className="btn-secondary text-xs py-1.5">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><ShieldCheck className="w-3.5 h-3.5" />Enable MFA</>}
      </button>
    </div>
  );
}
