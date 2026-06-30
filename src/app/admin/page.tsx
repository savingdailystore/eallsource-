import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/admin';
import { AdminOrgsTable } from '@/components/admin/AdminOrgsTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin' };

export default async function AdminPage() {
  const session = await auth();
  if (!isPlatformAdmin(session?.user?.email)) redirect('/dashboard');

  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      scanEnabled: true,
      isBroadcastSource: true,
      receiveBroadcast: true,
      createdAt: true,
      _count: { select: { users: true, leads: true } },
      subscription: {
        select: { status: true, trialEndsAt: true, currentPeriodEnd: true },
      },
      users: {
        select: { id: true, email: true, role: true, canManualLead: true },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-50">Admin — Organizations</h1>
        <p className="text-slate-400 text-sm mt-1">Manage plans, trial dates, and scan access per org.</p>
      </div>

      {/* Role legend */}
      <div className="card p-4 mb-5 bg-slate-800/30 border-slate-700/50">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Role Model</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {[
            { role: 'OWNER',   color: 'text-white',       desc: 'Platform owner only — never assigned to customers' },
            { role: 'ADMIN',   color: 'text-blue-400',    desc: "Customer org's primary user — billing, team, full access" },
            { role: 'ANALYST', color: 'text-slate-300',   desc: 'Power user — all tools, no team management' },
            { role: 'VIEWER',  color: 'text-slate-400',   desc: 'Read-only — can view leads, no actions' },
          ].map(({ role, color, desc }) => (
            <div key={role} className="flex flex-col gap-1">
              <span className={`font-semibold ${color}`}>{role}</span>
              <span className="text-slate-500 leading-tight">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      <AdminOrgsTable orgs={orgs} />
    </div>
  );
}
