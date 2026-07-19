'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Save, RefreshCw } from 'lucide-react';

type LeadTier   = 'BASIC' | 'PRO' | 'PREMIUM';
type LeadStatus = 'NEW' | 'REJECTED' | 'EXPIRED';

interface SourceLead {
  id:        string;
  status:    string;
  leadTier:  string;
  score:     number | null;
  createdAt: string;
  product: {
    asin:           string;
    title:          string;
    sourceRetailer: string | null;
    sourcePrice:    number | null;
    buyBoxPrice:    number | null;
    roi:            number | null;
  } | null;
}

type RowEdit = { leadTier: LeadTier; status: LeadStatus };
type RowSaveState = { saving: boolean; saved: boolean; error: string | null };

const TIER_LABELS: Record<LeadTier, string> = {
  BASIC:   'BASIC — all PRO+ orgs',
  PRO:     'PRO — PRO+ orgs only',
  PREMIUM: 'PREMIUM — ENTERPRISE only',
};

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'NEW',      label: 'NEW' },
  { value: 'REJECTED', label: 'REJECTED' },
  { value: 'EXPIRED',  label: 'EXPIRED' },
];

export function AdminSourceLeads() {
  const [leads, setLeads]   = useState<SourceLead[]>([]);
  const [total, setTotal]   = useState(0);
  const [page,  setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Per-row pending edits
  const [edits, setEdits]         = useState<Record<string, RowEdit>>({});
  const [saveState, setSaveState] = useState<Record<string, RowSaveState>>({});

  const limit = 50;

  const fetchLeads = useCallback(async (p: number) => {
    setLoading(true);
    setFetchError(null);
    try {
      const res  = await fetch(`/api/admin/source-leads?page=${p}&limit=${limit}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setLeads(data.leads);
      setTotal(data.total);
    } catch (e) {
      setFetchError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeads(page); }, [fetchLeads, page]);

  function getEdit(lead: SourceLead): RowEdit {
    return edits[lead.id] ?? { leadTier: lead.leadTier as LeadTier, status: lead.status as LeadStatus };
  }

  function setEdit(leadId: string, patch: Partial<RowEdit>) {
    setEdits(prev => ({ ...prev, [leadId]: { ...getEdit(leads.find(l => l.id === leadId)!), ...prev[leadId], ...patch } }));
    setSaveState(prev => ({ ...prev, [leadId]: { saving: false, saved: false, error: null } }));
  }

  async function saveRow(lead: SourceLead) {
    const edit = getEdit(lead);
    const dirty = edit.leadTier !== lead.leadTier || edit.status !== lead.status;
    if (!dirty) return;

    setSaveState(prev => ({ ...prev, [lead.id]: { saving: true, saved: false, error: null } }));
    try {
      const res  = await fetch(`/api/admin/source-leads/${lead.id}`, {
        method:  'PATCH',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ leadTier: edit.leadTier, status: edit.status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Save failed');
      // Optimistically update local leads list
      setLeads(prev => prev.map(l => l.id === lead.id
        ? { ...l, leadTier: body.lead.leadTier, status: body.lead.status }
        : l
      ));
      setEdits(prev => { const n = { ...prev }; delete n[lead.id]; return n; });
      setSaveState(prev => ({ ...prev, [lead.id]: { saving: false, saved: true, error: null } }));
      setTimeout(() => setSaveState(prev => ({ ...prev, [lead.id]: { saving: false, saved: false, error: null } })), 3000);
    } catch (e) {
      setSaveState(prev => ({ ...prev, [lead.id]: { saving: false, saved: false, error: (e as Error).message } }));
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Source Lead Pool</h2>
          <p className="text-slate-400 text-xs mt-0.5">
            Review and adjust tier/status before the weekly broadcast. REJECTED and EXPIRED leads are excluded from the Monday drop.
          </p>
        </div>
        <button
          onClick={() => fetchLeads(page)}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Tier legend */}
      <div className="card p-3 mb-4 bg-slate-800/30 border-slate-700/50">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tier — delivery scope</div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div><span className="font-semibold text-slate-200">BASIC</span><span className="text-slate-500 ml-2">all PRO+ orgs (15/week)</span></div>
          <div><span className="font-semibold text-blue-400">PRO</span><span className="text-slate-500 ml-2">PRO+ orgs only</span></div>
          <div><span className="font-semibold text-purple-400">PREMIUM</span><span className="text-slate-500 ml-2">ENTERPRISE only</span></div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading source leads…
        </div>
      )}

      {fetchError && (
        <div className="text-red-400 text-sm py-4">{fetchError}</div>
      )}

      {!loading && !fetchError && leads.length === 0 && (
        <div className="text-slate-500 text-sm py-6">No source leads found.</div>
      )}

      {!loading && leads.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-700/60">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700/60 text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-3 py-2.5 font-medium">ASIN / Title</th>
                  <th className="text-left px-3 py-2.5 font-medium">Retailer</th>
                  <th className="text-right px-3 py-2.5 font-medium">Cost</th>
                  <th className="text-right px-3 py-2.5 font-medium">BBP</th>
                  <th className="text-right px-3 py-2.5 font-medium">ROI</th>
                  <th className="text-right px-3 py-2.5 font-medium">Score</th>
                  <th className="text-left px-3 py-2.5 font-medium">Tier</th>
                  <th className="text-left px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {leads.map(lead => {
                  const edit  = getEdit(lead);
                  const ss    = saveState[lead.id];
                  const dirty = edit.leadTier !== lead.leadTier || edit.status !== lead.status;
                  const tierColor = lead.leadTier === 'PRO' ? 'text-blue-400' : lead.leadTier === 'PREMIUM' ? 'text-purple-400' : 'text-slate-300';
                  const statusColor = lead.status === 'REJECTED' || lead.status === 'EXPIRED' ? 'text-red-400' : 'text-green-400';

                  return (
                    <tr key={lead.id} className={`transition-colors ${dirty ? 'bg-yellow-500/5' : 'hover:bg-slate-800/40'}`}>
                      <td className="px-3 py-2.5">
                        <div className="font-mono text-slate-400">{lead.product?.asin ?? '—'}</div>
                        <div className="text-slate-300 max-w-xs truncate">{lead.product?.title ?? '—'}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">{lead.product?.sourceRetailer ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right text-slate-300">
                        {lead.product?.sourcePrice != null ? `$${lead.product.sourcePrice.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-300">
                        {lead.product?.buyBoxPrice != null ? `$${lead.product.buyBoxPrice.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-300">
                        {lead.product?.roi != null ? `${lead.product.roi.toFixed(0)}%` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-300">{lead.score ?? '—'}</td>

                      {/* Tier select */}
                      <td className="px-3 py-2.5">
                        <select
                          value={edit.leadTier}
                          onChange={e => setEdit(lead.id, { leadTier: e.target.value as LeadTier })}
                          title={TIER_LABELS[edit.leadTier as LeadTier]}
                          className={`text-xs bg-slate-800 border border-slate-600 rounded-md px-2 py-1 focus:outline-none focus:border-blue-500 ${tierColor}`}
                        >
                          <option value="BASIC">BASIC</option>
                          <option value="PRO">PRO</option>
                          <option value="PREMIUM">PREMIUM</option>
                        </select>
                      </td>

                      {/* Status select */}
                      <td className="px-3 py-2.5">
                        <select
                          value={edit.status}
                          onChange={e => setEdit(lead.id, { status: e.target.value as LeadStatus })}
                          className={`text-xs bg-slate-800 border border-slate-600 rounded-md px-2 py-1 focus:outline-none focus:border-blue-500 ${statusColor}`}
                        >
                          {STATUS_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>

                      {/* Save button */}
                      <td className="px-3 py-2.5">
                        {ss?.error && <span className="text-red-400 text-xs">{ss.error}</span>}
                        {ss?.saved && <span className="text-green-400 text-xs">Saved</span>}
                        {!ss?.error && !ss?.saved && (
                          <button
                            onClick={() => saveRow(lead)}
                            disabled={!dirty || ss?.saving}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                              dirty
                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                : 'bg-slate-700 text-slate-500 cursor-default'
                            }`}
                          >
                            {ss?.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                            Save
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
              <span>{total} leads total</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 rounded border border-slate-700 hover:border-slate-500 disabled:opacity-40"
                >
                  Prev
                </button>
                <span>Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2 py-1 rounded border border-slate-700 hover:border-slate-500 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
