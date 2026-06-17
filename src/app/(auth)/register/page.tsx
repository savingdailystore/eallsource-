'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, Check } from 'lucide-react';

const FEATURES = [
  '14-day free trial — no credit card',
  'Full lead engine with ROI calculator',
  'Validation engine (95%+ confidence required)',
  'Inventory & repricing tools (Pro)',
];

export default function RegisterPage() {
  const router = useRouter();

  const [orgName,  setOrgName]  = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/auth/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ orgName, email, password }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? 'Registration failed. Please try again.');
      return;
    }

    const { signIn } = await import('next-auth/react');
    await signIn('credentials', { email, password, redirect: false });
    router.push('/dashboard');
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-50 mb-1">Start your free trial</h1>
      <p className="text-slate-400 text-sm mb-4">14 days free. No credit card required.</p>

      <ul className="space-y-1 mb-6">
        {FEATURES.map((f) => (
          <li key={f} className="flex items-center gap-2 text-xs text-slate-300">
            <Check className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
            {f}
          </li>
        ))}
      </ul>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="org">Organization / Business name</label>
          <input id="org" type="text" required autoFocus value={orgName} onChange={(e) => setOrgName(e.target.value)} className="input" placeholder="My Amazon Business" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@company.com" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <div className="relative">
            <input id="password" type={showPw ? 'text' : 'password'} required minLength={12} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input pr-10" placeholder="Min 12 chars, upper, lower, number, symbol" />
            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create account'}
        </button>
      </form>

      <p className="text-center text-xs text-slate-500 mt-4">
        By signing up you agree to our{' '}
        <Link href="/terms" className="underline hover:text-slate-300">Terms of Service</Link>
        {' '}and{' '}
        <Link href="/privacy" className="underline hover:text-slate-300">Privacy Policy</Link>.
      </p>
      <p className="text-center text-sm text-slate-400 mt-4">
        Already have an account?{' '}
        <Link href="/login" className="text-blue-600 font-medium hover:text-blue-400">Sign in</Link>
      </p>
    </>
  );
}
