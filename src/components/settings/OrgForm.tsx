'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  orgName: string;
  orgSlug: string;
  canEdit: boolean;
}

export function OrgForm({ orgName, orgSlug, canEdit }: Props) {
  const [name, setName]       = useState(orgName);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    const res = await fetch('/api/settings/org', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Failed to save changes.');
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Organization Name</label>
        <input
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
          disabled={!canEdit}
        />
      </div>
      <div>
        <label className="label">Slug</label>
        <input type="text" value={orgSlug} disabled className="input opacity-60 cursor-not-allowed" />
        <p className="text-xs text-zinc-500 mt-1">Slug cannot be changed after creation.</p>
      </div>
      {error   && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-green-400">Saved successfully.</p>}
      {canEdit && (
        <button type="submit" disabled={loading} className="btn-primary text-sm">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save changes'}
        </button>
      )}
    </form>
  );
}
