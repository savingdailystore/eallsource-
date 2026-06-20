'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StickyNote, Loader2, Check } from 'lucide-react';

interface Props {
  productId:     string;
  initialNotes:  string | null;
  canEdit:       boolean;
}

export function LeadNotes({ productId, initialNotes, canEdit }: Props) {
  const router = useRouter();
  const [notes,   setNotes]   = useState(initialNotes ?? '');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  const dirty = notes.trim() !== (initialNotes ?? '').trim();

  async function save() {
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/products/${productId}/notes`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ notes }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    }
  }

  // Non-owners with no note to show: render nothing.
  if (!canEdit && !initialNotes) return null;

  return (
    <div className="card p-5">
      <h2 className="font-semibold text-slate-50 mb-3 flex items-center gap-2">
        <StickyNote className="w-4 h-4 text-amber-400" />Sourcing notes
      </h2>

      {canEdit ? (
        <>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="e.g. Add 5 to cart · promo code NEWADOPTION20 → $10.00/unit"
            className="input resize-y w-full"
          />
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="btn-primary text-xs py-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save notes'}
            </button>
            {saved && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <Check className="w-3.5 h-3.5" />Saved · shared with all users
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-300 whitespace-pre-line">{initialNotes}</p>
      )}
    </div>
  );
}
