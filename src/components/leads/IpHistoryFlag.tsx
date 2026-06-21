'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, Loader2 } from 'lucide-react';

interface Props {
  productId:        string;
  initialFlagged:    boolean;
  initialNote:       string | null;
  canEdit:           boolean;
}

export function IpHistoryFlag({ productId, initialFlagged, initialNote, canEdit }: Props) {
  const router = useRouter();
  const [flagged, setFlagged] = useState(initialFlagged);
  const [note,    setNote]    = useState(initialNote ?? '');
  const [saving,  setSaving]  = useState(false);
  const [editing, setEditing] = useState(false);

  async function submit(nextFlagged: boolean) {
    setSaving(true);
    const res = await fetch(`/api/products/${productId}/ip-history`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ flagged: nextFlagged, note }),
    });
    setSaving(false);
    if (res.ok) {
      setFlagged(nextFlagged);
      setEditing(false);
      router.refresh();
    }
  }

  if (!canEdit && !flagged) return null;

  if (flagged) {
    return (
      <div className="rounded-xl border px-4 py-3 mb-6 bg-red-500/10 border-red-500/30 flex gap-3">
        <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-red-300 font-semibold">Confirmed IP complaint history</p>
          {note && <p className="text-xs text-red-200/90 mt-0.5">{note}</p>}
          <p className="text-xs text-red-200/70 mt-1">This ASIN is permanently blocked from becoming a lead again.</p>
          {canEdit && (
            <button
              onClick={() => submit(false)}
              disabled={saving}
              className="btn-secondary text-xs py-1 mt-2"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Clear flag'}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="btn-secondary text-xs py-1.5 mb-6"
      >
        <ShieldAlert className="w-3.5 h-3.5" />Mark IP complaint history
      </button>
    );
  }

  return (
    <div className="card p-4 mb-6 border-red-500/30">
      <p className="text-sm text-slate-200 font-medium mb-2">Confirm this ASIN had a real IP complaint or takedown</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="What happened? (e.g. listing suspended for trademark complaint, May 2026)"
        className="input resize-y w-full mb-2"
      />
      <div className="flex gap-2">
        <button onClick={() => submit(true)} disabled={saving} className="btn-primary text-xs py-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm & block this ASIN'}
        </button>
        <button onClick={() => setEditing(false)} disabled={saving} className="btn-secondary text-xs py-1.5">
          Cancel
        </button>
      </div>
    </div>
  );
}
