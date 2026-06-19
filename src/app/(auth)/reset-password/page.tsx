'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token  = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [done,     setDone]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const res = await fetch('/api/auth/reset-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, newPassword: password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Could not reset your password.');
      return;
    }
    setDone(true);
    setTimeout(() => router.push('/login'), 2000);
  }

  if (!token) {
    return (
      <>
        <h1 className="text-2xl font-semibold text-slate-50 mb-1">Invalid reset link</h1>
        <p className="text-sm text-slate-400 mb-6">This link is missing its token. Request a new one.</p>
        <Link href="/forgot-password" className="text-sm text-blue-500 font-medium hover:text-blue-400 transition-colors">
          Request a new link →
        </Link>
      </>
    );
  }

  if (done) {
    return (
      <>
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-6 h-6 text-green-400" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-50 mb-1">Password reset</h1>
        <p className="text-sm text-slate-400">Redirecting you to sign in…</p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-50 mb-1">Choose a new password</h1>
      <p className="text-sm text-slate-400 mb-6">Must be 12+ characters with upper, lower, number, and symbol.</p>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-500/10 border border-red-500/30 text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="password">New password</label>
          <div className="relative">
            <input
              id="password"
              type={showPw ? 'text' : 'password'}
              required
              autoFocus
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pr-10"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="confirm">Confirm new password</label>
          <input
            id="confirm"
            type={showPw ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input"
            placeholder="••••••••"
          />
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reset password'}
        </button>
      </form>

      <p className="text-center text-sm text-slate-400 mt-6">
        <Link href="/login" className="text-blue-600 font-medium hover:text-blue-400 transition-colors">
          Back to sign in
        </Link>
      </p>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
