'use client';

import { useState } from 'react';
import { Loader2, Percent } from 'lucide-react';

interface Props {
  currentRate: number | null;
  canEdit: boolean;
}

// All 50 U.S. states + DC with base state sales-tax rates as starting-point helpers.
// These are state-level base rates only — county, city, and local surtaxes vary widely.
// Manual entry is the source of truth; state buttons pre-fill the input only.
const US_STATES = [
  { abbr: 'AL', name: 'Alabama',            rate: 4.000 },
  { abbr: 'AK', name: 'Alaska',             rate: 0.000 },
  { abbr: 'AZ', name: 'Arizona',            rate: 5.600 },
  { abbr: 'AR', name: 'Arkansas',           rate: 6.500 },
  { abbr: 'CA', name: 'California',         rate: 7.250 },
  { abbr: 'CO', name: 'Colorado',           rate: 2.900 },
  { abbr: 'CT', name: 'Connecticut',        rate: 6.350 },
  { abbr: 'DC', name: 'Washington D.C.',    rate: 6.000 },
  { abbr: 'DE', name: 'Delaware',           rate: 0.000 },
  { abbr: 'FL', name: 'Florida',            rate: 6.000 },
  { abbr: 'GA', name: 'Georgia',            rate: 4.000 },
  { abbr: 'HI', name: 'Hawaii',             rate: 4.000 },
  { abbr: 'ID', name: 'Idaho',              rate: 6.000 },
  { abbr: 'IL', name: 'Illinois',           rate: 6.250 },
  { abbr: 'IN', name: 'Indiana',            rate: 7.000 },
  { abbr: 'IA', name: 'Iowa',               rate: 6.000 },
  { abbr: 'KS', name: 'Kansas',             rate: 6.500 },
  { abbr: 'KY', name: 'Kentucky',           rate: 6.000 },
  { abbr: 'LA', name: 'Louisiana',          rate: 4.450 },
  { abbr: 'ME', name: 'Maine',              rate: 5.500 },
  { abbr: 'MD', name: 'Maryland',           rate: 6.000 },
  { abbr: 'MA', name: 'Massachusetts',      rate: 6.250 },
  { abbr: 'MI', name: 'Michigan',           rate: 6.000 },
  { abbr: 'MN', name: 'Minnesota',          rate: 6.875 },
  { abbr: 'MS', name: 'Mississippi',        rate: 7.000 },
  { abbr: 'MO', name: 'Missouri',           rate: 4.225 },
  { abbr: 'MT', name: 'Montana',            rate: 0.000 },
  { abbr: 'NE', name: 'Nebraska',           rate: 5.500 },
  { abbr: 'NV', name: 'Nevada',             rate: 6.850 },
  { abbr: 'NH', name: 'New Hampshire',      rate: 0.000 },
  { abbr: 'NJ', name: 'New Jersey',         rate: 6.625 },
  { abbr: 'NM', name: 'New Mexico',         rate: 5.000 },
  { abbr: 'NY', name: 'New York',           rate: 4.000 },
  { abbr: 'NC', name: 'North Carolina',     rate: 4.750 },
  { abbr: 'ND', name: 'North Dakota',       rate: 5.000 },
  { abbr: 'OH', name: 'Ohio',               rate: 5.750 },
  { abbr: 'OK', name: 'Oklahoma',           rate: 4.500 },
  { abbr: 'OR', name: 'Oregon',             rate: 0.000 },
  { abbr: 'PA', name: 'Pennsylvania',       rate: 6.000 },
  { abbr: 'RI', name: 'Rhode Island',       rate: 7.000 },
  { abbr: 'SC', name: 'South Carolina',     rate: 6.000 },
  { abbr: 'SD', name: 'South Dakota',       rate: 4.500 },
  { abbr: 'TN', name: 'Tennessee',          rate: 7.000 },
  { abbr: 'TX', name: 'Texas',              rate: 6.250 },
  { abbr: 'UT', name: 'Utah',               rate: 6.100 },
  { abbr: 'VT', name: 'Vermont',            rate: 6.000 },
  { abbr: 'VA', name: 'Virginia',           rate: 5.300 },
  { abbr: 'WA', name: 'Washington',         rate: 6.500 },
  { abbr: 'WV', name: 'West Virginia',      rate: 6.000 },
  { abbr: 'WI', name: 'Wisconsin',          rate: 5.000 },
  { abbr: 'WY', name: 'Wyoming',            rate: 4.000 },
] as const;

function fmtPct(rate: number): string {
  return (rate * 100).toFixed(4).replace(/\.?0+$/, '') + '%';
}

export function SourceTaxForm({ currentRate, canEdit }: Props) {
  const initInput = currentRate == null ? '' : (currentRate * 100).toFixed(4).replace(/\.?0+$/, '');

  const [rawInput, setRawInput] = useState(initInput);
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState(false);
  const [error,    setError]    = useState('');

  const parsedPct = rawInput.trim() === '' ? null : parseFloat(rawInput);
  const isValid   = parsedPct === null || (!isNaN(parsedPct) && parsedPct >= 0 && parsedPct <= 15);

  async function handleSave() {
    if (!isValid) return;
    setLoading(true);
    setError('');
    setSuccess(false);

    let rate: number | null;
    if (rawInput.trim() === '') {
      rate = null;
    } else {
      const pct = parseFloat(rawInput);
      if (isNaN(pct)) { setError('Enter a valid percentage, e.g. 8.25'); setLoading(false); return; }
      rate = pct / 100;
    }

    const res = await fetch('/api/settings/org', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ defaultSourceTaxRate: rate }),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Failed to save tax rate.');
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-300">
          Applied to source-price profitability calculations across all leads and candidates.
          {currentRate != null
            ? ` Currently ${fmtPct(currentRate)}.`
            : ' Currently using system default (8.75%).'}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          State buttons fill in the state base rate only — your real rate likely includes county and city additions. Verify your specific rate before saving.
        </p>
      </div>

      {/* State presets */}
      <div>
        <p className="label mb-2">State presets (base rates — verify locally)</p>
        <div className="flex flex-wrap gap-1">
          {US_STATES.map(s => (
            <button
              key={s.abbr}
              type="button"
              disabled={!canEdit}
              onClick={() => setRawInput(s.rate.toString())}
              title={`${s.name}: ${s.rate}% base rate`}
              className="px-2 py-1 rounded text-[11px] font-mono border border-slate-700 text-slate-400 hover:border-blue-500 hover:text-blue-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {s.abbr}
            </button>
          ))}
        </div>
      </div>

      {/* Manual entry */}
      <div>
        <label className="label">Source Tax Rate</label>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <input
              type="number"
              min="0"
              max="15"
              step="0.001"
              value={rawInput}
              onChange={e => setRawInput(e.target.value)}
              disabled={!canEdit}
              placeholder="e.g. 8.75"
              className="input pr-8 w-36"
            />
            <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          </div>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setRawInput('0')}
            className="btn-secondary text-xs py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            0% / Tax-exempt
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setRawInput('8.75')}
            className="btn-secondary text-xs py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            8.75% (default)
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setRawInput('')}
            className="btn-secondary text-xs py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear (use default)
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Enter your exact rate including local additions. Leave blank to use the 8.75% system default. Enter 0 if you hold a resale certificate.
        </p>
        {rawInput.trim() !== '' && !isNaN(parsedPct!) && (
          <p className="text-xs text-slate-400 mt-0.5">
            This will store <span className="text-slate-200 font-mono">{parsedPct!.toFixed(3)}%</span>
            {' '}({(parsedPct! / 100).toFixed(5)} as a decimal fraction).
          </p>
        )}
        {!isValid && <p className="text-xs text-red-400 mt-1">Rate must be between 0% and 15%.</p>}
      </div>

      {error   && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-green-400">Source tax rate saved.</p>}
      {canEdit && (
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !isValid}
          className="btn-primary text-sm disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save tax rate'}
        </button>
      )}
    </div>
  );
}
