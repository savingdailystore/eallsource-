import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AdminOrgsTable } from '@/components/admin/AdminOrgsTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin' };

const ADMIN_EMAILS = ['savingdailystore@gmail.com'];

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user || !ADMIN_EMAILS.includes(session.user.email)) redirect('/dashboard');

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
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-50">Admin — Organizations</h1>
        <p className="text-slate-400 text-sm mt-1">Manage plans, trial dates, and scan access per org.</p>
      </div>
      <AdminOrgsTable orgs={orgs} />
    </div>
  );
}
