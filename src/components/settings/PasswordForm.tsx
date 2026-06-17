'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [showCurrent, setShowCurrent]         = useState(false);
  const [showNew, setShowNew]                 = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [success, setSuccess]                 = useState(false);
  const [error, setError]                     = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    const res = await fetch('/api/settings/password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ currentPassword, newPassword }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Failed to change password.');
    } else {
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setSuccess(false), 3000);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Current Password</label>
        <div className="relative">
          <input
            type={showCurrent ? 'text' : 'password'}
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            className="input pr-10"
          />
          <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div>
        <label className="label">New Password</label>
        <div className="relative">
          <input
            type={showNew ? 'text' : 'password'}
            required
            minLength={12}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className="input pr-10"
            placeholder="Min 12 chars, upper, lower, number, symbol"
          />
          <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {error   && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">Password changed successfully.</p>}
      <button type="submit" disabled={loading} className="btn-secondary text-sm">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Change password'}
      </button>
    </form>
  );
}
