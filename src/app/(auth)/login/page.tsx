'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

function LoginForm() {
  const router      = useRouter();
  const params      = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/dashboard';

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [totp,     setTotp]     = useState('');
  const [mfaStep,  setMfaStep]  = useState(false);
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function finishSignIn(code?: string) {
    const result = await signIn('credentials', {
      email,
      password,
      totp: code ?? '',
      redirect: false,
    });
    setLoading(false);

    if (result?.error) {
      setError(mfaStep ? 'Invalid authentication code.' : 'Invalid email or password.');
    } else {
      router.push(callbackUrl);
      router.refresh();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    // If we're already on the MFA step, submit with the code.
    if (mfaStep) {
      await finishSignIn(totp);
      return;
    }

    // Step 1: validate password and check whether MFA is required.
    const res  = await fetch('/api/auth/mfa-check', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.valid) {
      setLoading(false);
      setError('Invalid email or password.');
      return;
    }

    if (data.mfaRequired) {
      setLoading(false);
      setMfaStep(true);
      return;
    }

    await finishSignIn();
  }

  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900 mb-1">Welcome back</h1>
      <p className="text-sm text-slate-500 mb-6">Sign in to your account</p>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-50 border border-red-100 text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={mfaStep}
            className="input disabled:opacity-60"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0" htmlFor="password">Password</label>
            <Link href="/forgot-password" className="text-xs text-orange-600 hover:text-orange-700 transition-colors">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPw ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={mfaStep}
              className="input pr-10 disabled:opacity-60"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {mfaStep && (
          <div>
            <label className="label" htmlFor="totp">Authentication code</label>
            <input
              id="totp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              className="input tracking-widest text-center font-mono"
              placeholder="000000"
              maxLength={6}
            />
            <p className="text-xs text-slate-400 mt-1">Enter the 6-digit code from your authenticator app.</p>
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mfaStep ? 'Verify & sign in' : 'Sign in'}
        </button>

        {mfaStep && (
          <button
            type="button"
            onClick={() => { setMfaStep(false); setTotp(''); setError(''); }}
            className="text-xs text-slate-500 hover:text-slate-700 w-full text-center"
          >
            ← Use a different account
          </button>
        )}
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-orange-600 font-medium hover:text-orange-700 transition-colors">
          Start free trial
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
