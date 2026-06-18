'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, Radio, ChevronDown, ChevronUp, Save } from 'lucide-react';

interface Subscription {
  status:         string;
  trialEndsAt:    string | Date | null;
  currentPeriodEnd: string | Date | null;
}

interface Org {
  id:                string;
  name:              string;
  slug:              string;
  plan:              string;
  scanEnabled:       boolean;
  isBroadcastSource: boolean;
  receiveBroadcast:  boolean;
  createdAt:         string | Date;
  subscription:      Subscription | null;
  _count:            { users: number; leads: number };
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toInputDate(d: string | Date | null | undefined) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

export function AdminOrgsTable({ orgs }: { orgs: Org[] }) {
  const router  = useRouter();
  const [loading, setLoading]   = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  // per-org edit state
  const [edits, setEdits] = useState<Record<string, { plan: string; trialEndsAt: string }>>({});

  function getEdit(org: Org) {
    return edits[org.id] ?? {
      plan:        org.plan,
      trialEndsAt: toInputDate(org.subscription?.trialEndsAt),
    };
  }

  function setEdit(org: Org, field: string, value: string) {
    setEdits((prev) => {
      const current = prev[org.id] ?? {
        plan:        org.plan,
        trialEndsAt: toInputDate(org.subscription?.trialEndsAt),
      };
      return { ...prev, [org.id]: { ...current, [field]: value } };
    });
  }

  async function patch(orgId: string, data: Record<string, boolean | string | null>) {
    setLoading(orgId);
    await fetch(`/api/admin/orgs/${orgId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    setLoading(null);
    router.refresh();
  }

  async function saveEdits(org: Org) {
    const e = getEdit(org);
    await patch(org.id, {
      plan:        e.plan,
      trialEndsAt: e.trialEndsAt ? new Date(e.trialEndsAt).toISOString() : null,
    });
    setExpanded(null);
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-800/40">
            {['Organization', 'Plan', 'Users', 'Leads', 'Trial Ends', 'Scan Access', 'Receives Leads', 'Joined', ''].map((h) => (
              <th key={h} className="table-th">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {orgs.map((org) => {
            const edit       = getEdit(org);
            const isExpanded = expanded === org.id;
            const isLoading  = loading === org.id;
            const sub        = org.subscription;

            return (
              <>
                <tr key={org.id} className="hover:bg-slate-800/40">
                  {/* Org name */}
                  <td className="table-td font-medium text-slate-100">
                    <div className="flex items-center gap-1.5">
                      {org.isBroadcastSource && <Radio className="w-3 h-3 text-blue-400 flex-shrink-0" aria-label="Broadcast source" />}
                      {org.name}
                    </div>
                    <div className="text-xs text-slate-500">{org.slug}</div>
                  </td>

                  {/* Plan */}
                  <td className="table-td">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${org.plan === 'PRO' ? 'bg-blue-500/20 text-blue-400' : org.plan === 'ENTERPRISE' ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-700 text-slate-300'}`}>
                      {org.plan}
                    </span>
                  </td>

                  <td className="table-td text-slate-300">{org._count.users}</td>
                  <td className="table-td text-slate-300">{org._count.leads}</td>

                  {/* Trial ends */}
                  <td className="table-td text-xs">
                    {sub?.status === 'trialing' ? (
                      <span className={sub.trialEndsAt && new Date(sub.trialEndsAt) < new Date() ? 'text-red-400' : 'text-amber-400'}>
                        {fmtDate(sub.trialEndsAt)}
                      </span>
                    ) : sub?.currentPeriodEnd ? (
                      <span className="text-slate-400">{fmtDate(sub.currentPeriodEnd)}</span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>

                  {/* Scan access toggle */}
                  <td className="table-td">
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    ) : org.isBroadcastSource ? (
                      <span className="flex items-center gap-1 text-blue-400 text-xs"><Radio className="w-3 h-3" />Source</span>
                    ) : org.scanEnabled ? (
                      <button onClick={() => patch(org.id, { scanEnabled: false })} className="flex items-center gap-1 text-green-400 hover:text-red-400 text-xs transition-colors">
                        <CheckCircle2 className="w-3.5 h-3.5" />Enabled
                      </button>
                    ) : (
                      <button onClick={() => patch(org.id, { scanEnabled: true })} className="flex items-center gap-1 text-slate-500 hover:text-green-400 text-xs transition-colors">
                        <XCircle className="w-3.5 h-3.5" />Enable
                      </button>
                    )}
                  </td>

                  {/* Broadcast receive toggle */}
                  <td className="table-td">
                    {org.isBroadcastSource ? (
                      <span className="text-xs text-slate-600">—</span>
                    ) : isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    ) : org.receiveBroadcast ? (
                      <button onClick={() => patch(org.id, { receiveBroadcast: false })} className="flex items-center gap-1 text-green-400 hover:text-red-400 text-xs transition-colors">
                        <CheckCircle2 className="w-3.5 h-3.5" />Receiving
                      </button>
                    ) : (
                      <button onClick={() => patch(org.id, { receiveBroadcast: true })} className="flex items-center gap-1 text-slate-500 hover:text-green-400 text-xs transition-colors">
                        <XCircle className="w-3.5 h-3.5" />Off
                      </button>
                    )}
                  </td>

                  <td className="table-td text-slate-400 text-xs">{new Date(org.createdAt).toLocaleDateString()}</td>

                  {/* Expand edit row */}
                  <td className="table-td">
                    <button
                      onClick={() => setExpanded(isExpanded ? null : org.id)}
                      className="text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </td>
                </tr>

                {/* Inline edit row */}
                {isExpanded && (
                  <tr key={`${org.id}-edit`} className="bg-slate-800/60">
                    <td colSpan={9} className="px-4 py-4">
                      <div className="flex items-end gap-4 flex-wrap">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Plan</label>
                          <select
                            value={edit.plan}
                            onChange={(e) => setEdit(org, 'plan', e.target.value)}
                            className="bg-slate-700 border border-slate-600 rounded-md text-sm text-slate-200 px-3 py-1.5 focus:outline-none focus:border-blue-500"
                          >
                            <option value="STARTER">STARTER</option>
                            <option value="PRO">PRO</option>
                            <option value="ENTERPRISE">ENTERPRISE</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Trial ends</label>
                          <input
                            type="date"
                            value={edit.trialEndsAt}
                            onChange={(e) => setEdit(org, 'trialEndsAt', e.target.value)}
                            className="bg-slate-700 border border-slate-600 rounded-md text-sm text-slate-200 px-3 py-1.5 focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        <button
                          onClick={() => saveEdits(org)}
                          disabled={isLoading}
                          className="flex items-center gap-1.5 btn-primary text-sm py-1.5"
                        >
                          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          Save
                        </button>

                        <button onClick={() => setExpanded(null)} className="text-xs text-slate-500 hover:text-slate-300">
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
