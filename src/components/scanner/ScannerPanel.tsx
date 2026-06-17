'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Radar, Loader2, CheckCircle2, XCircle, Clock, Play, FlaskConical } from 'lucide-react';

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
  PENDING: { cls: 'bg-amber-100 text-amber-700',  icon: Clock },
  RUNNING: { cls: 'bg-blue-100 text-blue-700',    icon: Loader2 },
  DONE:    { cls: 'bg-green-100 text-green-700',   icon: CheckCircle2 },
  FAILED:  { cls: 'bg-red-100 text-red-600',       icon: XCircle },
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

  async function runScan(demo: boolean) {
    setLoading(true);
    setResult(null);

    const res  = await fetch('/api/scanner', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ retailer, query: query.trim() || undefined, category: category.trim() || undefined, demo }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (res.ok) {
      setResult({
        ok: true,
        message: demo
          ? `Demo scan complete — ${data.count ?? 0} sample products added. Check Lead Feed.`
          : `Scan queued for ${retailer}.`,
      });
      setQuery('');
      setCategory('');
      router.refresh();
    } else {
      setResult({ ok: false, message: data.error ?? 'Failed to start scan.' });
    }
  }

  function startScan(e: React.FormEvent) {
    e.preventDefault();
    runScan(false);
  }

  return (
    <div className="space-y-6">
      {/* Start scan form */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Radar className="w-4 h-4 text-blue-500" />
          <h2 className="font-semibold text-slate-900">Start a scan</h2>
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
              <label className="label">Category <span className="text-slate-400 font-normal">(optional)</span></label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} className="input" placeholder="e.g. Home & Kitchen" />
            </div>
          </div>

          {result && (
            <p className={`text-sm flex items-center gap-1.5 ${result.ok ? 'text-green-600' : 'text-red-600'}`}>
              {result.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {result.message}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={loading || !retailer} className="btn-primary">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Play className="w-4 h-4" />Start scan</>}
            </button>
            <button type="button" onClick={() => runScan(true)} disabled={loading || !retailer} className="btn-secondary">
              <FlaskConical className="w-4 h-4" />Run demo scan
            </button>
          </div>
        </form>

        <p className="text-xs text-slate-400 mt-4 leading-relaxed">
          <span className="font-medium text-slate-500">Start scan</span> runs on a background worker via Apify — a job stays
          <span className="font-medium text-amber-600"> Pending</span> until the worker, Redis queue, and
          <span className="font-mono"> APIFY_TOKEN</span> are configured.{' '}
          <span className="font-medium text-slate-500">Run demo scan</span> generates realistic sample products instantly (no Apify
          needed) so you can test the flow — results appear in your Lead Feed and Products.
        </p>
      </div>

      {/* Recent jobs */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Recent scans</h2>
          {hasActive && <span className="text-xs text-blue-600 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Live</span>}
        </div>

        {jobs.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No scans yet. Start one above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Retailer', 'Query', 'Status', 'Started'].map((h) => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {jobs.map((job) => {
                  const s = STATUS_STYLE[job.status] ?? STATUS_STYLE.PENDING;
                  return (
                    <tr key={job.id} className="hover:bg-slate-50">
                      <td className="table-td font-medium text-slate-800">{job.retailer ?? '—'}</td>
                      <td className="table-td text-slate-600">{job.query || <span className="text-slate-400">all</span>}</td>
                      <td className="table-td">
                        <span className={`badge text-xs ${s.cls}`}>
                          <s.icon className={`w-3 h-3 mr-1 ${job.status === 'RUNNING' ? 'animate-spin' : ''}`} />
                          {job.status}
                        </span>
                        {job.status === 'FAILED' && job.error && (
                          <div className="text-[10px] text-red-500 mt-1 max-w-xs truncate" title={job.error}>{job.error}</div>
                        )}
                      </td>
                      <td className="table-td text-slate-500 text-xs">{new Date(job.createdAt).toLocaleString()}</td>
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
