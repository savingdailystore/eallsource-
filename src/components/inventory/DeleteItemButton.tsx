'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';

export function DeleteItemButton({ id, title }: { id: string; title: string }) {
  const router  = useRouter();
  const [busy, setBusy]         = useState(false);
  const [confirm, setConfirm]   = useState(false);

  async function handleDelete() {
    setBusy(true);
    await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  if (confirm) {
    return (
      <span className="flex items-center gap-1">
        <button
          onClick={handleDelete}
          disabled={busy}
          className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded-lg font-medium transition-colors"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Delete'}
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="text-xs text-zinc-500 hover:text-zinc-300 px-1"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      title={`Delete "${title}"`}
      className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}
