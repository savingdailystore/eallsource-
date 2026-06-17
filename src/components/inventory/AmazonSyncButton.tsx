'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw, Link2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Props {
  connected: boolean;
}

export function AmazonSyncButton({ connected }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<{ ok: boolean; message: string } | null>(null);

  if (!connected) {
    return (
      <Link href="/dashboard/amazon" className="btn-secondary text-sm">
        <Link2 className="w-4 h-4" />Connect Amazon
      </Link>
    );
  }

  async function sync() {
    setLoading(true);
    setResult(null);

    const res  = await fetch('/api/amazon/inventory', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (res.ok) {
      setResult({ ok: true, message: data.synced > 0
        ? `Synced ${data.synced} item${data.synced === 1 ? '' : 's'} from Amazon FBA.`
        : (data.message ?? 'No FBA inventory found.') });
      router.refresh();
    } else {
      const msg =
        data.error === 'missing_env'  ? 'Server is missing Amazon API credentials. Contact your admin.' :
        data.error === 'not_connected'? 'Amazon account is not connected.' :
        data.message ?? 'Sync failed. Please try again.';
      setResult({ ok: false, message: msg });
    }
  }

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className={`flex items-center gap-1.5 text-xs ${result.ok ? 'text-green-400' : 'text-red-400'}`}>
          {result.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {result.message}
        </span>
      )}
      <button onClick={sync} disabled={loading} className="btn-secondary text-sm">
        {loading
          ? <><Loader2 className="w-4 h-4 animate-spin" />Syncing…</>
          : <><RefreshCw className="w-4 h-4" />Sync from Amazon</>}
      </button>
    </div>
  );
}
