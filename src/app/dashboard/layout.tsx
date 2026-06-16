import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Sidebar } from '@/components/layout/Sidebar';
import { prisma } from '@/lib/prisma';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login');

  const org = await prisma.organization.findUnique({
    where: { id: session.user.orgId },
    select: { name: true, plan: true },
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar
        plan={org?.plan ?? session.user.plan}
        orgName={org?.name ?? 'My Organization'}
        userEmail={session.user.email}
      />
      <main
        className="flex-1 overflow-auto"
        style={{ marginLeft: 'var(--sidebar-width)' }}
      >
        {children}
      </main>
    </div>
  );
}
