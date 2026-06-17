'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function DisconnectButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDisconnect() {
    setLoading(true);
    const res = await fetch('/api/amazon/disconnect', { method: 'POST' });
    setLoading(false);
    if (res.ok) router.refresh();
  }

  return (
    <button
      onClick={handleDisconnect}
      disabled={loading}
      className="btn-danger text-xs py-1.5 ml-auto disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Disconnect'}
    </button>
  );
}
