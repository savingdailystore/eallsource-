'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface Org {
  id:          string;
  name:        string;
  slug:        string;
  plan:        string;
  scanEnabled: boolean;
  createdAt:   string | Date;
  _count:      { users: number; leads: number };
}

export function AdminOrgsTable({ orgs }: { orgs: Org[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function toggle(orgId: string, enable: boolean) {
    setLoading(orgId);
    await fetch(`/api/admin/orgs/${orgId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ scanEnabled: enable }),
    });
    setLoading(null);
    router.refresh();
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-800/40">
            {['Organization', 'Plan', 'Users', 'Leads', 'Scan Access', 'Joined', 'Action'].map((h) => (
              <th key={h} className="table-th">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {orgs.map((org) => (
            <tr key={org.id} className="hover:bg-slate-800/40">
              <td className="table-td font-medium text-slate-100">
                <div>{org.name}</div>
                <div className="text-xs text-slate-500">{org.slug}</div>
              </td>
              <td className="table-td text-slate-300">{org.plan}</td>
              <td className="table-td text-slate-300">{org._count.users}</td>
              <td className="table-td text-slate-300">{org._count.leads}</td>
              <td className="table-td">
                {org.scanEnabled
                  ? <span className="flex items-center gap-1 text-green-400"><CheckCircle2 className="w-3.5 h-3.5" />Enabled</span>
                  : <span className="flex items-center gap-1 text-slate-500"><XCircle className="w-3.5 h-3.5" />Disabled</span>}
              </td>
              <td className="table-td text-slate-400 text-xs">
                {new Date(org.createdAt).toLocaleDateString()}
              </td>
              <td className="table-td">
                {loading === org.id ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                ) : org.scanEnabled ? (
                  <button
                    onClick={() => toggle(org.id, false)}
                    className="text-xs text-red-400 hover:text-red-300 underline"
                  >
                    Disable
                  </button>
                ) : (
                  <button
                    onClick={() => toggle(org.id, true)}
                    className="text-xs text-blue-400 hover:text-blue-300 underline"
                  >
                    Enable scans
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
