import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { OrgForm } from '@/components/settings/OrgForm';
import { PasswordForm } from '@/components/settings/PasswordForm';
import { TeamMembers } from '@/components/settings/TeamMembers';
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
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Team</span>
        </div>

        <TeamMembers
          members={users}
          currentUserId={session!.user.id}
          canManage={canManageUsers}
          canInvite={canManageUsers && session!.user.plan !== 'STARTER'}
        />

        {session!.user.plan === 'STARTER' && (
          <div className="mt-4 text-xs text-slate-400">
            Inviting team members requires Pro or Enterprise.{' '}
            <a href="/dashboard/billing" className="text-blue-600 hover:underline">Upgrade →</a>
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
