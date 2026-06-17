'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Play, Loader2 } from 'lucide-react';

export function ToggleRuleButton({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    await fetch(`/api/repricing/rules/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isActive: !isActive }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={isActive ? 'Pause this rule' : 'Activate this rule'}
      className={`p-1.5 rounded-lg transition-all ${
        isActive
          ? 'text-zinc-600 hover:text-amber-500 hover:bg-amber-500/10'
          : 'text-zinc-600 hover:text-green-400 hover:bg-green-500/10'
      }`}
    >
      {busy
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
    </button>
  );
}
