'use client';

import { useState } from 'react';
import { CalendarClock, Plus, Trash2, Loader2, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface SavedSearch {
  id:        string;
  retailer:  string;
  query:     string;
  enabled:   boolean;
  lastRunAt: string | null;
  lastResult: unknown;
}

interface Props {
  initialSearches: SavedSearch[];
  retailers:       string[];
}

export function ScheduledSearches({ initialSearches, retailers }: Props) {
  const router = useRouter();
  const [searches, setSearches] = useState<SavedSearch[]>(initialSearches);
  const [retailer, setRetailer] = useState(retailers[0] ?? '');
  const [query, setQuery]       = useState('');
  const [adding, setAdding]     = useState(false);
  const [busyId, setBusyId]     = useState<string | null>(null);
  const [running, setRunning]   = useState(false);
  const [runMsg, setRunMsg]     = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setAdding(true);
    const res = await fetch('/api/saved-searches', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ retailer, query: query.trim() }),
    });
    setAdding(false);
    if (res.ok) {
      const { search } = await res.json();
      setSearches((s) => [...s, search]);
      setQuery('');
    }
  }

  async function toggle(id: string, enabled: boolean) {
    setBusyId(id);
    const res = await fetch(`/api/saved-searches/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ enabled }),
    });
    setBusyId(null);
    if (res.ok) setSearches((s) => s.map((x) => (x.id === id ? { ...x, enabled } : x)));
  }

  async function remove(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/saved-searches/${id}`, { method: 'DELETE' });
    setBusyId(null);
    if (res.ok) setSearches((s) => s.filter((x) => x.id !== id));
  }

  async function runNow() {
    setRunning(true);
    setRunMsg(null);
    try {
      const res  = await fetch('/api/saved-searches/run-now', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setRunMsg(data.error ?? 'Run failed.');
      } else if (data.ran === 0) {
        setRunMsg(data.message ?? 'No enabled searches to run.');
      } else {
        const ran     = (data.ranSearches ?? []) as string[];
        const skipped = (data.skippedSearches ?? []) as string[];

        const parts = [`Scanned ${data.productsFound} product${data.productsFound === 1 ? '' : 's'} across ${data.ran} search${data.ran === 1 ? '' : 'es'}`];
        if (data.leadsCreated) parts.push(`${data.leadsCreated} new lead${data.leadsCreated === 1 ? '' : 's'}`);
        if (data.leadsUpdated) parts.push(`${data.leadsUpdated} updated`);
        if (!data.leadsCreated && !data.leadsUpdated) parts.push('0 qualified');

        // Why products were filtered out
        const f = data.filtered ?? {};
        const reasons: string[] = [];
        if (f.noMatch)          reasons.push(`${f.noMatch} no Amazon match`);
        if (f.notProfitable)    reasons.push(`${f.notProfitable} not profitable`);
        if (f.demandTooLow)     reasons.push(`${f.demandTooLow} low demand`);
        if (f.validationFailed) reasons.push(`${f.validationFailed} failed validation`);
        if (data.failures)      reasons.push(`${data.failures} errored`);

        const lines = [parts.join(' · ') + (reasons.length ? ` — filtered: ${reasons.join(', ')}` : '')];
        if (ran.length)     lines.push(`Ran: ${ran.join(', ')}`);
        if (skipped.length) lines.push(`Not run this time (click Run now again): ${skipped.join(', ')}`);

        setRunMsg(lines.join('\n'));
        router.refresh();
      }
    } catch {
      setRunMsg('Run failed.');
    } finally {
      setRunning(false);
    }
  }

  const enabledCount = searches.filter((s) => s.enabled).length;

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-blue-400" />
          <h2 className="font-semibold text-slate-50">Scheduled searches</h2>
        </div>
        <button
          onClick={runNow}
          disabled={running || enabledCount === 0}
          className="btn-secondary text-xs py-1.5"
          title={enabledCount === 0 ? 'Enable at least one search first' : 'Run all enabled searches now'}
        >
          {running ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Running…</> : <><Play className="w-3.5 h-3.5" />Run now</>}
        </button>
      </div>
      <p className="text-sm text-slate-400 mb-1">
        These searches run automatically every Monday 9am UTC. {enabledCount} of {searches.length} active.
      </p>
      {running && (
        <p className="text-xs text-slate-500 mb-4">Scraping can take a minute or two per search — keep this tab open.</p>
      )}
      {runMsg && !running && (
        <p className="text-xs text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 mb-4 whitespace-pre-line">{runMsg}</p>
      )}
      <div className="mb-4" />

      {/* Add form */}
      <form onSubmit={add} className="flex flex-col sm:flex-row gap-2 mb-5">
        <select
          value={retailer}
          onChange={(e) => setRetailer(e.target.value)}
          className="input sm:w-44"
        >
          {retailers.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Keyword, e.g. lego star wars"
          className="input flex-1"
        />
        <button type="submit" disabled={adding || !query.trim()} className="btn-primary justify-center sm:w-auto">
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" />Add</>}
        </button>
      </form>

      {/* List */}
      {searches.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-500">
          No scheduled searches yet. Add one above to start scanning weekly.
        </div>
      ) : (
        <div className="space-y-2">
          {searches.map((s) => (
            <div key={s.id} className="flex items-center gap-3 bg-slate-800/50 border border-slate-800 rounded-xl px-4 py-3">
              {/* Toggle */}
              <button
                onClick={() => toggle(s.id, !s.enabled)}
                disabled={busyId === s.id}
                className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${s.enabled ? 'bg-blue-500' : 'bg-slate-700'}`}
                aria-label={s.enabled ? 'Disable' : 'Enable'}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${s.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded">{s.retailer}</span>
                  <span className="text-sm text-slate-200 truncate">{s.query}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {s.lastRunAt ? `Last run ${new Date(s.lastRunAt).toLocaleString()}` : 'Not run yet'}
                </div>
              </div>

              <button
                onClick={() => remove(s.id)}
                disabled={busyId === s.id}
                className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0"
                aria-label="Delete"
              >
                {busyId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
