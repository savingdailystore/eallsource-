'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PlusCircle, Loader2, CheckCircle2, ChevronDown } from 'lucide-react';

interface Props {
  retailers: string[];
}

type Result =
  | { kind: 'success'; leadId: string | null; outcome: string; broadcast: number }
  | { kind: 'error'; message: string };

export function ManualLeadEntry({ retailers }: Props) {
  const router = useRouter();
  const [amazonUrl,   setAmazonUrl]   = useState('');
  const [retailerUrl, setRetailerUrl] = useState('');
  const [retailer,    setRetailer]    = useState(retailers[0] ?? '');
  const [sourcePrice, setSourcePrice] = useState('');
  const [title,       setTitle]       = useState('');
  const [notes,       setNotes]       = useState('');
  const [showMore,    setShowMore]    = useState(false);
  const [busy,        setBusy]        = useState(false);
  const [result,      setResult]      = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);

    const price = parseFloat(sourcePrice);
    if (!Number.isFinite(price) || price <= 0) {
      setResult({ kind: 'error', message: 'Enter a valid source price.' });
      setBusy(false);
      return;
    }

    try {
      const res = await fetch('/api/leads/manual', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          amazonUrl:   amazonUrl.trim(),
          retailerUrl: retailerUrl.trim(),
          retailer,
          sourcePrice: price,
          title:       title.trim() || undefined,
          notes:       notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setResult({ kind: 'error', message: typeof data.error === 'string' ? data.error : 'Could not add the lead.' });
      } else {
        setResult({ kind: 'success', leadId: data.leadId, outcome: data.outcome, broadcast: data.broadcast ?? 0 });
        setAmazonUrl(''); setRetailerUrl(''); setSourcePrice(''); setTitle(''); setNotes('');
        router.refresh();
      }
    } catch {
      setResult({ kind: 'error', message: 'Could not add the lead.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-1">
        <PlusCircle className="w-5 h-5 text-blue-400" />
        <h2 className="font-semibold text-slate-50">Add a lead manually</h2>
      </div>
      <p className="text-sm text-slate-400 mb-4">
        Paste an Amazon link and the retailer link, set the source price, and we&apos;ll fill in
        fees, BSR, gating, and profitability automatically. The lead is shared with all users.
      </p>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="amazonUrl">Amazon listing link</label>
          <input
            id="amazonUrl"
            type="url"
            required
            value={amazonUrl}
            onChange={(e) => setAmazonUrl(e.target.value)}
            placeholder="https://www.amazon.com/dp/B0GQYP7T9D"
            className="input"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="label" htmlFor="retailerUrl">Retailer listing link</label>
            <input
              id="retailerUrl"
              type="url"
              required
              value={retailerUrl}
              onChange={(e) => setRetailerUrl(e.target.value)}
              placeholder="https://www.walmart.com/ip/..."
              className="input"
            />
          </div>
          <div className="sm:w-40">
            <label className="label" htmlFor="retailer">Retailer</label>
            <select id="retailer" value={retailer} onChange={(e) => setRetailer(e.target.value)} className="input">
              {retailers.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="sm:w-36">
            <label className="label" htmlFor="sourcePrice">Source price</label>
            <input
              id="sourcePrice"
              type="number"
              step="0.01"
              min="0"
              required
              value={sourcePrice}
              onChange={(e) => setSourcePrice(e.target.value)}
              placeholder="19.99"
              className="input"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMore ? 'rotate-180' : ''}`} />
          Optional: title &amp; notes
        </button>
        {showMore && (
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="title">Title (leave blank to use the Amazon title)</label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Auto-filled from Amazon if blank"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="notes">Sourcing notes (shared with all users)</label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Add 5 to cart · promo code NEWADOPTION20 → $10.00/unit"
                className="input resize-y"
              />
            </div>
          </div>
        )}

        <button type="submit" disabled={busy} className="btn-primary justify-center">
          {busy
            ? <><Loader2 className="w-4 h-4 animate-spin" />Building lead…</>
            : <><PlusCircle className="w-4 h-4" />Add to lead feed</>}
        </button>
      </form>

      {busy && (
        <p className="text-xs text-slate-500 mt-3">Fetching Amazon market data — this can take a few seconds.</p>
      )}

      {result?.kind === 'success' && (
        <div className="mt-4 flex items-start gap-2 text-sm bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2.5 text-green-300">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            Lead {result.outcome === 'lead_updated' ? 'updated' : 'created'}
            {result.broadcast > 0 && ` and shared with ${result.broadcast} org${result.broadcast === 1 ? '' : 's'}`}.
            {result.leadId && (
              <> <Link href={`/dashboard/leads/${result.leadId}`} className="underline font-medium">View lead →</Link></>
            )}
          </div>
        </div>
      )}
      {result?.kind === 'error' && (
        <div className="mt-4 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-red-300">
          {result.message}
        </div>
      )}
    </div>
  );
}
