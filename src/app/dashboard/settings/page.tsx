import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Settings, Users, Building2, Bell } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const session = await auth();
  const orgId   = session!.user.orgId;

  const [org, users] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, slug: true, plan: true },
    }),
    prisma.user.findMany({
      where: { orgId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const canManageUsers = ['OWNER', 'ADMIN'].includes(session!.user.role);

  return (
    <div className="p-6 lg:p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your organization and account preferences</p>
      </div>

      {/* Organization */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-4 h-4 text-slate-500" />
          <h2 className="font-semibold text-slate-900">Organization</h2>
        </div>
        <form method="POST" action="/api/settings/org" className="space-y-4">
          <div>
            <label className="label">Organization Name</label>
            <input name="name" type="text" defaultValue={org?.name} className="input" />
          </div>
          <div>
            <label className="label">Slug</label>
            <input type="text" value={org?.slug} disabled className="input opacity-60 cursor-not-allowed" />
            <p className="text-xs text-slate-400 mt-1">Slug cannot be changed after creation.</p>
          </div>
          {canManageUsers && (
            <button type="submit" className="btn-primary text-sm">Save changes</button>
          )}
        </form>
      </div>

      {/* Team */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <h2 className="font-semibold text-slate-900">Team Members</h2>
          </div>
          {canManageUsers && session!.user.plan !== 'STARTER' && (
            <button className="btn-secondary text-xs">Invite member</button>
          )}
        </div>

        <div className="divide-y divide-slate-50">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-medium text-slate-900">{u.name ?? u.email}</div>
                {u.name && <div className="text-xs text-slate-400">{u.email}</div>}
              </div>
              <span className="badge bg-slate-100 text-slate-600 text-xs">{u.role}</span>
            </div>
          ))}
        </div>

        {session!.user.plan === 'STARTER' && (
          <div className="mt-4 text-xs text-slate-400">
            Team collaboration requires Pro or Enterprise.{' '}
            <a href="/dashboard/billing" className="text-green-600 hover:underline">Upgrade →</a>
          </div>
        )}
      </div>

      {/* Account */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-4 h-4 text-slate-500" />
          <h2 className="font-semibold text-slate-900">Account</h2>
        </div>
        <form method="POST" action="/api/settings/password" className="space-y-4">
          <div>
            <label className="label">Current Password</label>
            <input name="current" type="password" className="input" autoComplete="current-password" />
          </div>
          <div>
            <label className="label">New Password</label>
            <input name="new" type="password" minLength={8} className="input" autoComplete="new-password" />
          </div>
          <button type="submit" className="btn-secondary text-sm">Change password</button>
        </form>
      </div>
    </div>
  );
}
