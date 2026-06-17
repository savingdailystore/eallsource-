import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { Sidebar } from '@/components/layout/Sidebar';
import { prisma } from '@/lib/prisma';
import { isPasswordExpired } from '@/lib/password';
import { AlertTriangle } from 'lucide-react';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login');

  const [org, currentUser] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: session.user.orgId },
      select: { name: true, plan: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordChangedAt: true },
    }),
  ]);

  const passwordExpired = currentUser ? isPasswordExpired(currentUser.passwordChangedAt) : false;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        plan={org?.plan ?? session.user.plan}
        role={session.user.role}
        orgName={org?.name ?? 'My Organization'}
        userEmail={session.user.email}
      />
      <main
        className="flex-1 overflow-auto"
        style={{ marginLeft: 'var(--sidebar-width)' }}
      >
        {passwordExpired && (
          <div className="flex items-center gap-2 px-6 py-2.5 bg-amber-50 border-b border-amber-100 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Your password is over 365 days old and must be rotated.</span>
            <Link href="/dashboard/settings" className="font-medium underline ml-1">Change it now</Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
