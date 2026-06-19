'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, MailCheck } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch('/api/auth/forgot-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email }),
    }).catch(() => {});
    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <>
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
          <MailCheck className="w-6 h-6 text-blue-400" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-50 mb-1">Check your email</h1>
        <p className="text-sm text-slate-400 mb-6">
          If an account exists for <span className="text-slate-200">{email}</span>, we&apos;ve sent a
          link to reset your password. The link expires in 1 hour.
        </p>
        <Link href="/login" className="text-sm text-blue-500 font-medium hover:text-blue-400 transition-colors">
          ← Back to sign in
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-50 mb-1">Forgot your password?</h1>
      <p className="text-sm text-slate-400 mb-6">Enter your email and we&apos;ll send you a reset link.</p>

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
            className="input"
            placeholder="you@company.com"
          />
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send reset link'}
        </button>
      </form>

      <p className="text-center text-sm text-slate-400 mt-6">
        Remembered it?{' '}
        <Link href="/login" className="text-blue-600 font-medium hover:text-blue-400 transition-colors">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
