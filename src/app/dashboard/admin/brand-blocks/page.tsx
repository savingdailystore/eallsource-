'use client';

import { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, ShieldCheck, Trash2, Plus, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BrandBlock {
  id:              string;
  brand:           string;
  normalizedBrand: string;
  reason:          string | null;
  note:            string | null;
  isActive:        boolean;
  createdAt:       string;
  createdByEmail:  string | null;
  clearedAt:       string | null;
  clearedByEmail:  string | null;
}

export default function BrandBlocksPage() {
  const [blocks, setBlocks]       = useState<BrandBlock[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [clearing, setClearing]   = useState<string | null>(null);

  // Form state
  const [newBrand,  setNewBrand]  = useState('');
  const [newReason, setNewReason] = useState('');
  const [newNote,   setNewNote]   = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/brand-blocks');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Error ${res.status}`);
        return;
      }
      const data = await res.json();
      setBlocks(data.blocks ?? []);
    } catch {
      setError('Failed to load brand blocks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newBrand.trim()) { setFormError('Brand name is required'); return; }
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/brand-blocks', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ brand: newBrand.trim(), reason: newReason.trim() || null, note: newNote.trim() || null }),
      });
      const body = await res.json();
      if (!res.ok) { setFormError(body.error ?? `Error ${res.status}`); return; }
      setNewBrand('');
      setNewReason('');
      setNewNote('');
      await load();
    } catch {
      setFormError('Request failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClear(id: string) {
    if (!confirm('Unblock this brand? Future pipeline leads will be allowed again, and existing products will become visible.')) return;
    setClearing(id);
    try {
      const res = await fetch(`/api/admin/brand-blocks/${id}`, { method: 'PATCH' });
      if (!res.ok) { const b = await res.json().catch(() => ({})); alert(b.error ?? 'Error'); return; }
      await load();
    } finally {
      setClearing(null);
    }
  }

  const active   = blocks.filter(b => b.isActive);
  const inactive = blocks.filter(b => !b.isActive);

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <div className="page-header mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-orange-400" />
            Brand Blocklist
          </h1>
          <p className="page-subtitle">
            Block entire brands from entering the lead pipeline. Blocked brands cannot generate new leads and are hidden from the customer Products view.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="card border border-red-500/30 bg-red-500/10 text-red-300 text-sm p-4 mb-6">
          {error}
        </div>
      )}

      {/* ── Add block form ───────────────────────────────────────────────── */}
      <div className="card p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-orange-400" />
          Block a Brand
        </h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Brand Name <span className="text-red-400">*</span></label>
              <input
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                placeholder="e.g. Astercook"
                value={newBrand}
                onChange={e => setNewBrand(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Reason</label>
              <input
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                placeholder="e.g. Private label — third-party"
                value={newReason}
                onChange={e => setNewReason(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Note (internal only)</label>
            <input
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
              placeholder="Additional context for operators"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              disabled={submitting}
            />
          </div>
          {formError && <p className="text-xs text-red-400">{formError}</p>}
          <button type="submit" disabled={submitting} className="btn-primary text-sm">
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
            Block Brand
          </button>
        </form>
      </div>

      {/* ── Active blocks ────────────────────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-slate-300 mb-3">
        Active Blocks ({active.length})
      </h2>
      {loading ? (
        <div className="card p-8 text-center text-slate-500 text-sm"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : active.length === 0 ? (
        <div className="card p-8 text-center text-slate-500 text-sm flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-green-500" />
          No brands are currently blocked
        </div>
      ) : (
        <div className="card overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/40">
                {['Brand', 'Normalized', 'Reason', 'Blocked By', 'Blocked At', ''].map(h => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {active.map(b => (
                <tr key={b.id} className="hover:bg-slate-800/30">
                  <td className="table-td font-medium text-orange-300">{b.brand}</td>
                  <td className="table-td text-xs text-slate-500 font-mono">{b.normalizedBrand}</td>
                  <td className="table-td text-xs text-slate-400">{b.reason ?? '—'}</td>
                  <td className="table-td text-xs text-slate-400">{b.createdByEmail ?? '—'}</td>
                  <td className="table-td text-xs text-slate-500">{new Date(b.createdAt).toLocaleDateString()}</td>
                  <td className="table-td">
                    <button
                      onClick={() => handleClear(b.id)}
                      disabled={clearing === b.id}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 transition-colors"
                      title="Unblock brand"
                    >
                      {clearing === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Unblock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Cleared history ──────────────────────────────────────────────── */}
      {inactive.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-slate-500 mb-3">
            Cleared History ({inactive.length})
          </h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40">
                  {['Brand', 'Reason', 'Cleared By', 'Cleared At'].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {inactive.map(b => (
                  <tr key={b.id} className={cn('opacity-50')}>
                    <td className="table-td text-slate-400">{b.brand}</td>
                    <td className="table-td text-xs text-slate-500">{b.reason ?? '—'}</td>
                    <td className="table-td text-xs text-slate-500">{b.clearedByEmail ?? '—'}</td>
                    <td className="table-td text-xs text-slate-500">{b.clearedAt ? new Date(b.clearedAt).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
