'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Radar, Loader2, CheckCircle2, XCircle, Clock, Play } from 'lucide-react';

interface Job {
  id:          string;
  type:        string;
  retailer:    string | null;
  query:       string | null;
  status:      string;
  error:       string | null;
  createdAt:   Date | string;
}

const STATUS_STYLE: Record<string, { cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  PENDING: { cls: 'bg-amber-500/15 text-amber-400',  icon: Clock },
  RUNNING: { cls: 'bg-blue-500/15 text-blue-400',    icon: Loader2 },
  DONE:    { cls: 'bg-green-500/15 text-green-400',   icon: CheckCircle2 },
  FAILED:  { cls: 'bg-red-500/15 text-red-400',       icon: XCircle },
};

export function ScannerPanel({ retailers, jobs }: { retailers: string[]; jobs: Job[] }) {
  const router = useRouter();
  const [retailer, setRetailer] = useState(retailers[0] ?? '');
  const [query, setQuery]       = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<{ ok: boolean; message: string } | null>(null);

  const hasActive = jobs.some((j) => j.status === 'PENDING' || j.status === 'RUNNING');

  // Auto-refresh while jobs are in progress so statuses update live.
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [hasActive, router]);

  async function startScan(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const res  = await fetch('/api/scanner', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ retailer, query: query.trim() || undefined, category: category.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (res.ok) {
      const r = data.result;
      setResult({
        ok: true,
        message: r
          ? `Scan complete — ${r.created ?? 0} new lead${(r.created ?? 0) === 1 ? '' : 's'} from ${r.found ?? 0} products. Check Lead Feed.`
          : `Scan complete for ${retailer}.`,
      });
      setQuery('');
      setCategory('');
      router.refresh();
    } else {
      setResult({ ok: false, message: data.error ?? data.message ?? 'Scan failed.' });
    }
  }

  return (
    <div className="space-y-6">
      {/* Start scan form */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Radar className="w-4 h-4 text-blue-500" />
          <h2 className="font-semibold text-slate-50">Start a scan</h2>
        </div>

        <form onSubmit={startScan} className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="label">Retailer</label>
              <select value={retailer} onChange={(e) => setRetailer(e.target.value)} className="input">
                {retailers.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Search query</label>
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="input" placeholder="e.g. coffee maker" />
            </div>
            <div>
              <label className="label">Category <span className="text-slate-500 font-normal">(optional)</span></label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} className="input" placeholder="e.g. Home & Kitchen" />
            </div>
          </div>

          {result && (
            <p className={`text-sm flex items-center gap-1.5 ${result.ok ? 'text-green-400' : 'text-red-400'}`}>
              {result.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {result.message}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={loading || !retailer} className="btn-primary">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Scanning…</> : <><Play className="w-4 h-4" />Start scan</>}
            </button>
          </div>
        </form>

        {loading && (
          <p className="text-xs text-slate-500 mt-3">Scraping and analysing against Amazon — this can take a minute or two. Keep this tab open.</p>
        )}
        <p className="text-xs text-slate-500 mt-4 leading-relaxed">
          Scans run live via Apify and are matched + priced against Amazon. Qualified opportunities appear in your{' '}
          <span className="font-medium text-slate-400">Lead Feed</span>. For recurring searches, use{' '}
          <span className="font-medium text-slate-400">Scheduled searches</span> below.
        </p>
      </div>

      {/* Recent jobs */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold text-slate-50">Recent scans</h2>
          {hasActive && <span className="text-xs text-blue-600 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Live</span>}
        </div>

        {jobs.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">No scans yet. Start one above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40">
                  {['Retailer', 'Query', 'Status', 'Started'].map((h) => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {jobs.map((job) => {
                  const s = STATUS_STYLE[job.status] ?? STATUS_STYLE.PENDING;
                  return (
                    <tr key={job.id} className="hover:bg-slate-800/40">
                      <td className="table-td font-medium text-slate-100">{job.retailer ?? '—'}</td>
                      <td className="table-td text-slate-300">{job.query || <span className="text-slate-500">all</span>}</td>
                      <td className="table-td">
                        <span className={`badge text-xs ${s.cls}`}>
                          <s.icon className={`w-3 h-3 mr-1 ${job.status === 'RUNNING' ? 'animate-spin' : ''}`} />
                          {job.status}
                        </span>
                        {job.status === 'FAILED' && job.error && (
                          <div className="text-[10px] text-red-400 mt-1 max-w-xs truncate" title={job.error}>{job.error}</div>
                        )}
                      </td>
                      <td className="table-td text-slate-400 text-xs">{new Date(job.createdAt).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
