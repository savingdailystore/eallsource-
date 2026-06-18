'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, Radio } from 'lucide-react';

interface Org {
  id:               string;
  name:             string;
  slug:             string;
  plan:             string;
  scanEnabled:      boolean;
  isBroadcastSource: boolean;
  receiveBroadcast: boolean;
  createdAt:        string | Date;
  _count:           { users: number; leads: number };
}

export function AdminOrgsTable({ orgs }: { orgs: Org[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function patch(orgId: string, data: Record<string, boolean | string>) {
    setLoading(orgId);
    await fetch(`/api/admin/orgs/${orgId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    setLoading(null);
    router.refresh();
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-800/40">
            {['Organization', 'Plan', 'Users', 'Leads', 'Scan Access', 'Receives Leads', 'Joined'].map((h) => (
              <th key={h} className="table-th">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {orgs.map((org) => (
            <tr key={org.id} className="hover:bg-slate-800/40">
              <td className="table-td font-medium text-slate-100">
                <div className="flex items-center gap-1.5">
                  {org.isBroadcastSource && <Radio className="w-3 h-3 text-blue-400 flex-shrink-0" aria-label="Broadcast source" />}
                  {org.name}
                </div>
                <div className="text-xs text-slate-500">{org.slug}</div>
              </td>
              <td className="table-td">
                <select
                  value={org.plan}
                  disabled={loading === org.id}
                  onChange={(e) => patch(org.id, { plan: e.target.value })}
                  className="bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-200 px-2 py-1 focus:outline-none focus:border-blue-500"
                >
                  <option value="STARTER">STARTER</option>
                  <option value="PRO">PRO</option>
                  <option value="ENTERPRISE">ENTERPRISE</option>
                </select>
              </td>
              <td className="table-td text-slate-300">{org._count.users}</td>
              <td className="table-td text-slate-300">{org._count.leads}</td>

              {/* Scan access toggle */}
              <td className="table-td">
                {loading === org.id ? (
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
                ) : loading === org.id ? (
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

              <td className="table-td text-slate-400 text-xs">
                {new Date(org.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
