'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, X, Loader2, Trash2, RefreshCw } from 'lucide-react';

interface Member {
  id:        string;
  email:     string;
  name:      string | null;
  role:      string;
  createdAt: Date | string;
}

interface Props {
  members:         Member[];
  currentUserId:   string;
  canManage:       boolean;
  canInvite:       boolean;
}

const ROLE_BADGE: Record<string, string> = {
  OWNER:   'bg-zinc-800 text-white',
  ADMIN:   'bg-orange-100 text-orange-700',
  ANALYST: 'bg-slate-100 text-slate-600',
  VIEWER:  'bg-slate-100 text-slate-500',
};

const ASSIGNABLE = ['ADMIN', 'ANALYST', 'VIEWER'];

function randomPassword() {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghijkmnpqrstuvwxyz';
  const digits  = '23456789';
  const special = '!@#$%^&*';
  const all     = upper + lower + digits + special;
  // Guarantee at least one of each required class, then fill to 16 chars.
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  const base = [pick(upper), pick(lower), pick(digits), pick(special)];
  while (base.length < 16) base.push(pick(all));
  // Shuffle so the required chars aren't always in front.
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base.join('');
}

export function TeamMembers({ members, currentUserId, canManage, canInvite }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen]     = useState(false);

  async function changeRole(id: string, role: string) {
    setBusyId(id);
    await fetch(`/api/team/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ role }),
    });
    setBusyId(null);
    router.refresh();
  }

  async function removeMember(id: string) {
    if (!confirm('Remove this team member? They will lose access immediately.')) return;
    setBusyId(id);
    await fetch(`/api/team/${id}`, { method: 'DELETE' });
    setBusyId(null);
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-slate-900">Team Members</h2>
          <span className="text-xs text-slate-400">({members.length})</span>
        </div>
        {canInvite && (
          <button onClick={() => setOpen(true)} className="btn-secondary text-xs py-1.5">
            <UserPlus className="w-3.5 h-3.5" />Invite user
          </button>
        )}
      </div>

      <div className="divide-y divide-slate-50">
        {members.map((u) => {
          const isOwner = u.role === 'OWNER';
          const isSelf  = u.id === currentUserId;
          const editable = canManage && !isOwner;
          return (
            <div key={u.id} className="flex items-center justify-between py-3 gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">
                  {u.name ?? u.email}{isSelf && <span className="text-xs text-slate-400 font-normal"> (you)</span>}
                </div>
                {u.name && <div className="text-xs text-slate-400 truncate">{u.email}</div>}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {editable ? (
                  <select
                    value={u.role}
                    disabled={busyId === u.id}
                    onChange={(e) => changeRole(u.id, e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:border-orange-400"
                  >
                    {ASSIGNABLE.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                ) : (
                  <span className={`badge text-xs ${ROLE_BADGE[u.role] ?? 'bg-slate-100 text-slate-600'}`}>{u.role}</span>
                )}

                {canManage && !isOwner && !isSelf && (
                  <button
                    onClick={() => removeMember(u.id)}
                    disabled={busyId === u.id}
                    title="Remove member"
                    className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                  >
                    {busyId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {open && <InviteModal onClose={() => setOpen(false)} />}
    </>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', name: '', role: 'ANALYST', password: randomPassword() });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res  = await fetch('/api/team', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? 'Failed to invite user.');
    } else {
      setDone(true);
      router.refresh();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)' }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Invite Team Member</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="px-6 py-6 space-y-4">
            <p className="text-sm text-slate-600">
              Account created for <span className="font-medium">{form.email}</span>. Share these credentials with them —
              they can change the password after signing in.
            </p>
            <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-1">
              <div><span className="text-slate-400">Email:</span> <span className="font-mono">{form.email}</span></div>
              <div><span className="text-slate-400">Temp password:</span> <span className="font-mono">{form.password}</span></div>
              <div><span className="text-slate-400">Role:</span> {form.role}</div>
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="btn-primary">Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="px-6 py-5 space-y-4">
            <div>
              <label className="label">Email <span className="text-red-500">*</span></label>
              <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} type="email" required className="input" placeholder="teammate@company.com" />
            </div>
            <div>
              <label className="label">Name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} type="text" className="input" placeholder="Jane Doe" />
            </div>
            <div>
              <label className="label">Role</label>
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="input">
                <option value="ADMIN">Admin — full access, can manage team</option>
                <option value="ANALYST">Analyst — can use all tools</option>
                <option value="VIEWER">Viewer — read-only</option>
              </select>
            </div>
            <div>
              <label className="label">Temporary password</label>
              <div className="flex gap-2">
                <input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} type="text" required minLength={8} className="input font-mono" />
                <button type="button" onClick={() => setForm((f) => ({ ...f, password: randomPassword() }))} title="Generate new" className="btn-secondary px-3">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1">You'll share this with the user. They can change it after signing in.</p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create user'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
