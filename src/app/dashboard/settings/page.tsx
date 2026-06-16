import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { OrgForm } from '@/components/settings/OrgForm';
import { PasswordForm } from '@/components/settings/PasswordForm';
import { Users, Building2, Settings } from 'lucide-react';

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
        <OrgForm
          orgName={org?.name ?? ''}
          orgSlug={org?.slug ?? ''}
          canEdit={canManageUsers}
        />
      </div>

      {/* Team */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <h2 className="font-semibold text-slate-900">Team Members</h2>
          </div>
          {canManageUsers && session!.user.plan !== 'STARTER' && (
            <span className="text-xs text-slate-400 italic">Invite via admin console (coming soon)</span>
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
          <h2 className="font-semibold text-slate-900">Change Password</h2>
        </div>
        <PasswordForm />
      </div>
    </div>
  );
}
